import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Get the path to the 'data' directory, which is one level above the compiled '/dist' directory.
const dataDir = path.resolve(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'data.db');

// Ensure the directory for the database exists (it will, but this is good practice)
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// MIGRATION: Check if 'transactions' table has 'balance_snapshot'
try {
    const tableInfo = db.prepare("PRAGMA table_info(transactions)").all() as any[];
    const hasBalanceSnapshot = tableInfo.some(col => col.name === 'balance_snapshot');

    if (tableInfo.length > 0 && !hasBalanceSnapshot) {
        console.log("Migrating database: Adding balance_snapshot column to transactions...");
        db.prepare("ALTER TABLE transactions ADD COLUMN balance_snapshot REAL").run();
    }
} catch (error) {
    console.error("Migration check failed:", error);
}

// MIGRATION: Check if 'users' table has 'master_data_entry'
try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
    const hasMasterDataEntry = tableInfo.some(col => col.name === 'master_data_entry');

    if (tableInfo.length > 0 && !hasMasterDataEntry) {
        console.log("Migrating database: Adding master_data_entry column to users...");
        db.prepare("ALTER TABLE users ADD COLUMN master_data_entry BOOLEAN NOT NULL DEFAULT 0").run();
    }
} catch (error) {
    console.error("Migration check failed:", error);
}

// MIGRATION: Check if 'receipts' table has 'acting_as_client_id'
try {
    const tableInfo = db.prepare("PRAGMA table_info(receipts)").all() as any[];
    const hasActingAsClientId = tableInfo.some(col => col.name === 'acting_as_client_id');

    if (tableInfo.length > 0 && !hasActingAsClientId) {
        console.log("Migrating database: Adding acting_as_client_id column to receipts...");
        db.prepare("ALTER TABLE receipts ADD COLUMN acting_as_client_id INTEGER REFERENCES users(id)").run();
    }
} catch (error) {
    console.error("Migration check failed for receipts acting_as_client_id:", error);
}

// MIGRATION: Check if 'customers' table has 'email'
try {
    const tableInfo = db.prepare("PRAGMA table_info(customers)").all() as any[];
    const hasEmail = tableInfo.some(col => col.name === 'email');

    if (tableInfo.length > 0 && !hasEmail) {
        console.log("Migrating database: Adding email column to customers...");
        db.prepare("ALTER TABLE customers ADD COLUMN email TEXT").run();
    }
} catch (error) {
    console.error("Migration check failed for customers email:", error);
}

// MIGRATION: Check if 'customers' table has 'is_deleted'
try {
    const tableInfo = db.prepare("PRAGMA table_info(customers)").all() as any[];
    const hasIsDeleted = tableInfo.some(col => col.name === 'is_deleted');

    if (tableInfo.length > 0 && !hasIsDeleted) {
        console.log("Migrating database: Adding is_deleted column to customers...");
        db.prepare("ALTER TABLE customers ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT 0").run();
    }
} catch (error) {
    console.error("Migration check failed for customers is_deleted:", error);
}

// MIGRATION: Check if 'lab_reports' table has 'customer_id' and 'category'
try {
    const tableInfo = db.prepare("PRAGMA table_info(lab_reports)").all() as any[];
    const hasCustomerId = tableInfo.some(col => col.name === 'customer_id');
    const hasCategory = tableInfo.some(col => col.name === 'category');

    if (tableInfo.length > 0) {
        if (!hasCustomerId) {
            console.log("Migrating database: Adding customer_id column to lab_reports...");
            db.prepare("ALTER TABLE lab_reports ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE").run();
        }
        if (!hasCategory) {
            console.log("Migrating database: Adding category column to lab_reports...");
            db.prepare("ALTER TABLE lab_reports ADD COLUMN category TEXT CHECK(category IN ('With Header', 'Without Header', 'Bill', 'Others'))").run();
        }
    }
} catch (error) {
    console.error("Migration check failed for lab_reports columns:", error);
}

// MIGRATION: Check if 'packages' table has 'code_name'
try {
    const tableInfo = db.prepare("PRAGMA table_info(packages)").all() as any[];
    const hasCodeName = tableInfo.some(col => col.name === 'code_name');

    if (tableInfo.length > 0 && !hasCodeName) {
        console.log("Migrating database: Adding code_name column to packages...");
        db.prepare("ALTER TABLE packages ADD COLUMN code_name TEXT").run();

        // Seed default code abbreviations based on common terms
        console.log("Migrating database: Seeding default package code_names...");
        db.prepare("UPDATE packages SET code_name = 'CBC' WHERE name LIKE '%CBC%' OR name LIKE '%Complete Blood Count%'").run();
        db.prepare("UPDATE packages SET code_name = 'LFT' WHERE name LIKE '%LFT%' OR name LIKE '%Liver Function%'").run();
        db.prepare("UPDATE packages SET code_name = 'KFT' WHERE name LIKE '%KFT%' OR name LIKE '%Kidney Function%'").run();
        db.prepare("UPDATE packages SET code_name = 'TFT' WHERE name LIKE '%TFT%' OR name LIKE '%Thyroid%'").run();
        db.prepare("UPDATE packages SET code_name = 'WIDAL' WHERE name LIKE '%Widal%'").run();
        db.prepare("UPDATE packages SET code_name = 'ECG' WHERE name LIKE '%ECG%' OR name LIKE '%Electrocardiogram%'").run();
    }
} catch (error) {
    console.error("Migration check failed for packages code_name:", error);
}

// MIGRATION: Check if 'labs' table has 'is_deleted'
try {
    const tableInfo = db.prepare("PRAGMA table_info(labs)").all() as any[];
    const hasIsDeleted = tableInfo.some(col => col.name === 'is_deleted');

    if (tableInfo.length > 0 && !hasIsDeleted) {
        console.log("Migrating database: Adding is_deleted column to labs...");
        db.prepare("ALTER TABLE labs ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT 0").run();
    }
} catch (error) {
    console.error("Migration check failed for labs is_deleted:", error);
}

// MIGRATION: Clean up orphaned Mother Rate Lists from package_lists table
try {
    const orphanedLists = db.prepare(`
        SELECT id, name FROM package_lists 
        WHERE name LIKE '% Mother Ratelist' 
          AND id NOT IN (SELECT DISTINCT package_list_id FROM lab_package_lists)
    `).all() as any[];
    
    if (orphanedLists.length > 0) {
        console.log(`Migrating database: Found ${orphanedLists.length} orphaned Mother Rate Lists. Cleaning them up...`);
        const deleteList = db.prepare("DELETE FROM package_lists WHERE id = ?");
        orphanedLists.forEach(list => {
            console.log(`Deleting orphaned rate list: "${list.name}" (ID: ${list.id})`);
            deleteList.run(list.id);
        });
    }
} catch (error) {
    console.error("Migration cleanup failed for orphaned package lists:", error);
}


console.log('Database connected at', dbPath);

const schema = `
    CREATE TABLE IF NOT EXISTS lab_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        is_read BOOLEAN DEFAULT 0,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        category TEXT CHECK(category IN ('With Header', 'Without Header', 'Bill', 'Others')),
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comparison_tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS comparison_labs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS comparison_prices (
        test_id INTEGER NOT NULL,
        lab_id INTEGER NOT NULL,
        price REAL NOT NULL,
        PRIMARY KEY (test_id, lab_id),
        FOREIGN KEY (test_id) REFERENCES comparison_tests(id) ON DELETE CASCADE,
        FOREIGN KEY (lab_id) REFERENCES comparison_labs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        address TEXT,
        phone TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        alias TEXT,
        password_hash TEXT NOT NULL,
        branchId INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('ADMIN', 'GENERAL_EMPLOYEE', 'CLIENT', 'DATA_ENTRY')),
        wallet_balance REAL NOT NULL DEFAULT 0,
        allow_negative_balance BOOLEAN NOT NULL DEFAULT 0,
        negative_balance_allowed_until TEXT,
        master_data_entry BOOLEAN NOT NULL DEFAULT 0,
        FOREIGN KEY (branchId) REFERENCES branches(id)
    );
    
    -- ... and so on for all other tables
    CREATE TABLE IF NOT EXISTS package_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        mrp REAL NOT NULL,
        b2b_price REAL NOT NULL,
        package_list_id INTEGER NOT NULL,
        code_name TEXT,
        FOREIGN KEY (package_list_id) REFERENCES package_lists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS labs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        logo_path TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS admin_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        upi_id TEXT,
        organization_name TEXT,
        lab_name TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prefix TEXT,
        name TEXT NOT NULL,
        mobile TEXT,
        email TEXT,
        dob TEXT,
        age INTEGER,
        age_years INTEGER,
        age_months INTEGER,
        age_days INTEGER,
        gender TEXT CHECK(gender IN ('Male', 'Female')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by_user_id INTEGER NOT NULL,
        is_deleted BOOLEAN NOT NULL DEFAULT 0,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );
    
    CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        branch_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        total_mrp REAL NOT NULL,
        amount_final REAL NOT NULL,
        amount_received REAL NOT NULL,
        amount_due REAL NOT NULL,
        payment_method TEXT NOT NULL,
        referred_by TEXT,
        notes TEXT,
        num_tests INTEGER,
        logo_path TEXT,
        created_by_user_id INTEGER NOT NULL,
        acting_as_client_id INTEGER,
        data_entry_done BOOLEAN NOT NULL DEFAULT 0,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id),
        FOREIGN KEY (acting_as_client_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS receipt_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id INTEGER NOT NULL,
        package_name TEXT NOT NULL,
        mrp REAL NOT NULL,
        discount_percentage REAL NOT NULL,
        FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS estimates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        branch_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        amount_after_discount REAL NOT NULL,
        referred_by TEXT,
        notes TEXT,
        created_by_user_id INTEGER NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS estimate_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        estimate_id INTEGER NOT NULL,
        package_name TEXT NOT NULL,
        mrp REAL NOT NULL,
        discount_percentage REAL NOT NULL,
        FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('RECEIPT_DEDUCTION', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'SETTLEMENT')),
        amount_deducted REAL NOT NULL,
        balance_snapshot REAL,
        notes TEXT,
        receipt_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS lab_package_lists (
        lab_id INTEGER NOT NULL,
        package_list_id INTEGER NOT NULL,
        PRIMARY KEY (lab_id, package_list_id),
        FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE CASCADE,
        FOREIGN KEY (package_list_id) REFERENCES package_lists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_package_list_access (
        user_id INTEGER NOT NULL,
        package_list_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, package_list_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (package_list_id) REFERENCES package_lists(id) ON DELETE CASCADE
    );
`;

export function initDb() {
    db.exec(schema);

    // Alter table to add alarm_done column if not present
    try {
        db.exec("ALTER TABLE receipts ADD COLUMN alarm_done BOOLEAN NOT NULL DEFAULT 0;");
        console.log("Added alarm_done column to receipts table successfully.");
    } catch (e) {
        // Ignored if column already exists
    }

    // Alter table to add package_list_id column to receipt_items if not present
    try {
        db.exec("ALTER TABLE receipt_items ADD COLUMN package_list_id INTEGER;");
        console.log("Added package_list_id column to receipt_items successfully.");
    } catch (e) {
        // Ignored if column already exists
    }

    // One-time run to mark previous day 3+ critical alarms as done to prevent spam
    try {
        const now = new Date();
        const pending = db.prepare(`
            SELECT r.id, r.created_at 
            FROM receipts r
            WHERE r.alarm_done = 0 
              AND r.customer_id NOT IN (SELECT customer_id FROM lab_reports WHERE customer_id IS NOT NULL)
        `).all() as any[];

        const updateStmt = db.prepare('UPDATE receipts SET alarm_done = 1 WHERE id = ?');
        let count = 0;
        pending.forEach(r => {
            try {
                const datePart = r.created_at.split(' | ')[0]; // "DD/MM/YYYY"
                const [d, m, y] = datePart.split('/').map(Number);
                const createdDate = new Date(y, m - 1, d);
                
                const msDiff = now.getTime() - createdDate.getTime();
                const daysDiff = Math.floor(msDiff / (1000 * 3600 * 24));
                
                if (daysDiff >= 2) { // 3rd day onwards (Day 3+ critical alarm)
                    updateStmt.run(r.id);
                    count++;
                }
            } catch (err) {
                // Ignore parse errors
            }
        });
        if (count > 0) {
            console.log(`Marked ${count} existing Day 3+ critical alarms as done in the database.`);
        }
    } catch (err) {
        console.error("Failed to mark existing alarms as done:", err);
    }

    // Seeding data (only if tables are empty)
    const transaction = db.transaction(() => {
        // Check if admin user exists
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
        if (userCount.count > 0) {
            console.log('Database already seeded.');
            return;
        }

        console.log('Seeding database...');

        // Branches
        const mainBranchId = db.prepare('INSERT INTO branches (name, address, phone) VALUES (?, ?, ?)').run('Main Branch', '123 Test Street, Kolkata', '999-888-7777').lastInsertRowid;

        // Users
        const saltRounds = 10;
        const adminPass = bcrypt.hashSync('password', saltRounds);
        const testPass = bcrypt.hashSync('test', saltRounds);
        const clientPass = bcrypt.hashSync('client123', saltRounds);

        const adminId = db.prepare('INSERT INTO users (username, password_hash, branchId, role, master_data_entry) VALUES (?, ?, ?, ?, ?)').run('admin', adminPass, mainBranchId, 'ADMIN', 1).lastInsertRowid;
        const testUserId = db.prepare('INSERT INTO users (username, password_hash, branchId, role) VALUES (?, ?, ?, ?)').run('testuser', testPass, mainBranchId, 'GENERAL_EMPLOYEE').lastInsertRowid;
        const clientId = db.prepare('INSERT INTO users (username, alias, password_hash, branchId, role, wallet_balance) VALUES (?, ?, ?, ?, ?, ?)').run('client@b2b.com', 'B2B Corporate Client', clientPass, mainBranchId, 'CLIENT', 5000).lastInsertRowid;

        // Package Lists
        const retailListId = db.prepare('INSERT INTO package_lists (name) VALUES (?)').run('Retail Rates (Walk-in)').lastInsertRowid;
        const corpListId = db.prepare('INSERT INTO package_lists (name) VALUES (?)').run('Corporate Rates (B2B)').lastInsertRowid;

        // Packages
        const insertPackage = db.prepare('INSERT INTO packages (name, mrp, b2b_price, package_list_id) VALUES (?, ?, ?, ?)');
        insertPackage.run('Basic Health Check', 1200.0, 900.0, retailListId);
        insertPackage.run('Advanced Health Check', 2500.0, 1800.0, retailListId);
        insertPackage.run('Corporate Wellness Package', 1000.0, 750.0, corpListId);
        insertPackage.run('Pre-employment Screening', 1500.0, 1100.0, corpListId);

        // Labs
        const apolloId = db.prepare('INSERT INTO labs (name, logo_path) VALUES (?, ?)').run('Apollo Diagnostic', '/lab_logos/lab_1.png').lastInsertRowid;
        const lalPathId = db.prepare('INSERT INTO labs (name) VALUES (?)').run('Dr. Lal PathLabs').lastInsertRowid;

        // Junction tables
        const insertLabList = db.prepare('INSERT INTO lab_package_lists (lab_id, package_list_id) VALUES (?, ?)');
        insertLabList.run(apolloId, retailListId);
        insertLabList.run(lalPathId, retailListId);
        insertLabList.run(lalPathId, corpListId);

        const insertUserList = db.prepare('INSERT INTO user_package_list_access (user_id, package_list_id) VALUES (?, ?)');
        insertUserList.run(testUserId, retailListId);
        insertUserList.run(clientId, corpListId);

        console.log('Database seeded successfully.');
    });

    try {
        transaction();
    } catch (err) {
        console.error('Seeding failed:', err);
    }

    // Migration: Update pre-existing seeded users from plaintext bcrypt to SHA-256 bcrypt
    try {
        const sha256 = (str: string) => crypto.createHash('sha256').update(str).digest('hex');

        // Migrate admin
        const admin = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('admin') as { password_hash: string } | undefined;
        if (admin && bcrypt.compareSync('password', admin.password_hash)) {
            const hashedAdmin = bcrypt.hashSync(sha256('password'), 10);
            db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hashedAdmin, 'admin');
            console.log('Migrated admin user to SHA-256 bcrypt schema.');
        }

        // Migrate testuser
        const testuser = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('testuser') as { password_hash: string } | undefined;
        if (testuser && bcrypt.compareSync('test', testuser.password_hash)) {
            const hashedTest = bcrypt.hashSync(sha256('test'), 10);
            db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hashedTest, 'testuser');
            console.log('Migrated testuser to SHA-256 bcrypt schema.');
        }

        // Migrate client@b2b.com
        const client = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('client@b2b.com') as { password_hash: string } | undefined;
        if (client && bcrypt.compareSync('client123', client.password_hash)) {
            const hashedClient = bcrypt.hashSync(sha256('client123'), 10);
            db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hashedClient, 'client@b2b.com');
            console.log('Migrated client@b2b.com to SHA-256 bcrypt schema.');
        }
    } catch (e) {
        console.error('Failed to run seeded users password hash migration:', e);
    }
}