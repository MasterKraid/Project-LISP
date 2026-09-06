/**
 * Test Setup - In-memory SQLite database that mirrors production schema.
 * Provides helper functions for seeding test data.
 */
import Database from 'better-sqlite3';

// Create a fresh in-memory database for each test run
export function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
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
            logo_path TEXT
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
            alarm_done BOOLEAN NOT NULL DEFAULT 0,
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
            package_list_id INTEGER,
            FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
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

        CREATE TABLE IF NOT EXISTS master_packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS master_package_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            master_package_id INTEGER NOT NULL,
            alias_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            FOREIGN KEY (master_package_id) REFERENCES master_packages(id) ON DELETE CASCADE
        );
    `);

    return db;
}

/**
 * Seeds a complete multi-lab test scenario:
 * - 1 branch
 * - 2 labs (Lab A, Lab B)  
 * - 2 package lists (List A under Lab A, List B under Lab B)
 * - A client with access to both lists
 * - Distinct and overlapping test packages in each list
 * - 1 admin user
 * - 1 customer
 */
export function seedMultiLabScenario(db: ReturnType<typeof createTestDb>) {
    // Branch
    db.prepare('INSERT INTO branches (id, name) VALUES (1, ?)').run('Main Branch');

    // Labs
    db.prepare('INSERT INTO labs (id, name) VALUES (?, ?)').run(1, 'Lab Alpha');
    db.prepare('INSERT INTO labs (id, name) VALUES (?, ?)').run(2, 'Lab Beta');

    // Package Lists
    db.prepare('INSERT INTO package_lists (id, name) VALUES (?, ?)').run(10, 'Alpha Rate List');
    db.prepare('INSERT INTO package_lists (id, name) VALUES (?, ?)').run(20, 'Beta Rate List');

    // Map lists to labs
    db.prepare('INSERT INTO lab_package_lists (lab_id, package_list_id) VALUES (?, ?)').run(1, 10);
    db.prepare('INSERT INTO lab_package_lists (lab_id, package_list_id) VALUES (?, ?)').run(2, 20);

    // Packages in List A (Lab Alpha)
    const insertPkg = db.prepare('INSERT INTO packages (name, mrp, b2b_price, package_list_id) VALUES (?, ?, ?, ?)');
    insertPkg.run('CBC', 395, 150, 10);          // Common test - different B2B in each lab
    insertPkg.run('Glucose Fasting', 85, 30, 10);
    insertPkg.run('TSH', 320, 100, 10);
    insertPkg.run('Alpha Only Test', 500, 200, 10); // Exclusive to Alpha

    // Packages in List B (Lab Beta) 
    insertPkg.run('CBC', 330, 120, 20);          // Same name, DIFFERENT mrp & b2b
    insertPkg.run('Glucose Fasting', 85, 24, 20); // Same name & mrp, different b2b
    insertPkg.run('TSH', 350, 60, 20);            // Same name, different mrp & b2b
    insertPkg.run('Beta Only Test', 1000, 360, 20); // Exclusive to Beta

    // Admin user
    db.prepare('INSERT INTO users (id, username, password_hash, branchId, role) VALUES (?, ?, ?, ?, ?)')
        .run(1, 'admin', 'hash', 1, 'ADMIN');

    // Multi-lab B2B client with access to BOTH lists
    db.prepare('INSERT INTO users (id, username, password_hash, branchId, role, wallet_balance, allow_negative_balance) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(100, 'multi_lab_client', 'hash', 1, 'CLIENT', 10000, 0);
    db.prepare('INSERT INTO user_package_list_access (user_id, package_list_id) VALUES (?, ?)').run(100, 10);
    db.prepare('INSERT INTO user_package_list_access (user_id, package_list_id) VALUES (?, ?)').run(100, 20);

    // Single-lab B2B client with access to only List A
    db.prepare('INSERT INTO users (id, username, password_hash, branchId, role, wallet_balance, allow_negative_balance) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(200, 'single_lab_client', 'hash', 1, 'CLIENT', 5000, 0);
    db.prepare('INSERT INTO user_package_list_access (user_id, package_list_id) VALUES (?, ?)').run(200, 10);

    // Low-balance client (no negative balance allowed)
    db.prepare('INSERT INTO users (id, username, password_hash, branchId, role, wallet_balance, allow_negative_balance) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(300, 'broke_client', 'hash', 1, 'CLIENT', 50, 0);
    db.prepare('INSERT INTO user_package_list_access (user_id, package_list_id) VALUES (?, ?)').run(300, 10);

    // Negative-balance-allowed client
    db.prepare('INSERT INTO users (id, username, password_hash, branchId, role, wallet_balance, allow_negative_balance) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(400, 'negative_allowed_client', 'hash', 1, 'CLIENT', 50, 1);
    db.prepare('INSERT INTO user_package_list_access (user_id, package_list_id) VALUES (?, ?)').run(400, 10);

    // Customer
    db.prepare('INSERT INTO customers (id, prefix, name, mobile, gender, age_years, age_months, age_days, created_at, updated_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(1, 'MRS.', 'TEST PATIENT', '9876543210', 'Female', 35, 6, 0, '01/01/2026 | 10:00:00 | UTC+5:30', '01/01/2026 | 10:00:00 | UTC+5:30', 1);

    return {
        branchId: 1,
        labAlphaId: 1,
        labBetaId: 2,
        listAlphaId: 10,
        listBetaId: 20,
        adminId: 1,
        multiLabClientId: 100,
        singleLabClientId: 200,
        brokeClientId: 300,
        negativeAllowedClientId: 400,
        customerId: 1,
    };
}

/**
 * Helper: Calculate B2B cost for a set of items the same way the server does.
 * This is the CORRECT implementation — each item is looked up strictly by its own package_list_id.
 */
export function calculateB2BCost(
    db: ReturnType<typeof createTestDb>,
    items: Array<{ name: string; package_list_id: number }>,
    clientId: number
): number {
    const clientAccess = db.prepare('SELECT package_list_id FROM user_package_list_access WHERE user_id = ?').all(clientId) as { package_list_id: number }[];
    const listIds = clientAccess.map(r => r.package_list_id);

    return items.reduce((sum, item) => {
        if (!item.package_list_id || !listIds.includes(item.package_list_id)) {
            throw new Error(`Unauthorized or missing rate category for item: ${item.name}`);
        }
        const pkg = db.prepare('SELECT b2b_price FROM packages WHERE package_list_id = ? AND name = ?').get(item.package_list_id, item.name) as { b2b_price: number } | undefined;
        if (!pkg) {
            throw new Error(`Test '${item.name}' is not available in the selected laboratory/rate database.`);
        }
        return sum + pkg.b2b_price;
    }, 0);
}

/**
 * Helper: Create a receipt and process wallet deduction atomically (mirrors POST /receipts logic).
 */
export function createReceiptWithDeduction(
    db: ReturnType<typeof createTestDb>,
    params: {
        customerId: number;
        branchId: number;
        createdByUserId: number;
        actingAsClientId: number | null;
        items: Array<{ name: string; mrp: number; discount: number; package_list_id: number }>;
        paymentMethod?: string;
    }
) {
    const { customerId, branchId, createdByUserId, actingAsClientId, items, paymentMethod } = params;

    const totalMrp = items.reduce((s, i) => s + i.mrp, 0);
    const targetClientId = actingAsClientId || (
        (db.prepare('SELECT role FROM users WHERE id = ?').get(createdByUserId) as any)?.role === 'CLIENT'
            ? createdByUserId
            : -1
    );

    // Insert receipt
    const receiptResult = db.prepare(`
        INSERT INTO receipts (customer_id, branch_id, created_at, total_mrp, amount_final, amount_received, amount_due, payment_method, num_tests, created_by_user_id, acting_as_client_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(customerId, branchId, '01/01/2026 | 10:00:00 | UTC+5:30', totalMrp, totalMrp, totalMrp, 0, paymentMethod || 'B2B Wallet Deduction', items.length, createdByUserId, actingAsClientId);

    const receiptId = receiptResult.lastInsertRowid as number;

    // Insert items
    const insertItem = db.prepare('INSERT INTO receipt_items (receipt_id, package_name, mrp, discount_percentage, package_list_id) VALUES (?, ?, ?, ?, ?)');
    items.forEach(item => insertItem.run(receiptId, item.name, item.mrp, item.discount, item.package_list_id));

    // Process B2B deduction if applicable
    if (targetClientId !== -1) {
        const clientAccess = db.prepare('SELECT package_list_id FROM user_package_list_access WHERE user_id = ?').all(targetClientId) as { package_list_id: number }[];
        const listIds = clientAccess.map(r => r.package_list_id);

        const totalB2BCost = items.reduce((sum, item) => {
            const itemPkgListId = item.package_list_id;
            if (!itemPkgListId || !listIds.includes(itemPkgListId)) {
                throw new Error(`Unauthorized or missing rate category for item: ${item.name}`);
            }
            const pkg = db.prepare('SELECT b2b_price FROM packages WHERE package_list_id = ? AND name = ?').get(itemPkgListId, item.name) as { b2b_price: number } | undefined;
            if (!pkg) {
                throw new Error(`Test '${item.name}' is not available in the selected laboratory/rate database.`);
            }
            return sum + pkg.b2b_price;
        }, 0);

        // Check balance
        const client = db.prepare('SELECT wallet_balance, allow_negative_balance, negative_balance_allowed_until FROM users WHERE id = ?').get(targetClientId) as any;
        if (!client) throw new Error('Target B2B Client not found');

        let canProceed = false;
        if (client.wallet_balance >= totalB2BCost) {
            canProceed = true;
        } else if (client.allow_negative_balance) {
            if (client.negative_balance_allowed_until) {
                const untilDate = new Date(client.negative_balance_allowed_until);
                if (untilDate >= new Date()) canProceed = true;
            } else {
                canProceed = true;
            }
        }

        if (!canProceed) {
            throw new Error(`Insufficient wallet balance`);
        }

        db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(totalB2BCost, targetClientId);
        const newBalance = (db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(targetClientId) as any).wallet_balance;

        db.prepare('INSERT INTO transactions (user_id, date, type, amount_deducted, balance_snapshot, receipt_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(targetClientId, '01/01/2026 | 10:00:00 | UTC+5:30', 'RECEIPT_DEDUCTION', totalB2BCost, newBalance, receiptId, `Receipt deduction for RCPT-${String(receiptId).padStart(6, '0')}`);

        return { receiptId, totalB2BCost, newBalance };
    }

    return { receiptId, totalB2BCost: 0, newBalance: null };
}
