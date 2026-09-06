import { Router } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { db } from '../database';
import { User, Lab, Receipt, Estimate, Customer, Branch, PackageList, FormattedCustomer, Document, Transaction, Package, LabReport } from '../types';
import { isAdmin, isAuthenticated, getISTDateTimeString, upload, excelUpload } from './shared';

const router = Router();

// --- ADMIN-ONLY ROUTES ---

router.get('/users', isAdmin, (req, res) => {
    try {
        const users = db.prepare('SELECT id, username, alias, branchId, role, master_data_entry FROM users').all() as any[];
        const accesses = db.prepare('SELECT user_id, package_list_id FROM user_package_list_access').all() as any[];
        const accessMap: { [key: number]: number[] } = {};
        accesses.forEach((a: any) => {
            if (!accessMap[a.user_id]) accessMap[a.user_id] = [];
            accessMap[a.user_id].push(a.package_list_id);
        });
        users.forEach((u: any) => {
            u.assigned_list_ids = accessMap[u.id] || [];
        });
        res.json(users);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});
router.get('/branches', isAdmin, (req, res) => res.json(db.prepare('SELECT * FROM branches').all()));
router.get('/labs', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    let labs: Lab[];
    const actingAsId = req.headers['x-acting-as-client-id'];
    const effectiveUserId = (actingAsId && (user.role === 'ADMIN' || user.master_data_entry)) ? parseInt(actingAsId as string) : user.id;
    const isActuallyActingAs = !!(actingAsId && (user.role === 'ADMIN' || user.master_data_entry));

    try {
        if (user.role === 'ADMIN' && !isActuallyActingAs) {
            labs = db.prepare('SELECT * FROM labs WHERE is_deleted = 0').all() as Lab[];
        } else {
            labs = db.prepare(`
                SELECT DISTINCT l.* 
                FROM labs l 
                JOIN lab_package_lists lpl ON l.id = lpl.lab_id 
                JOIN user_package_list_access upla ON lpl.package_list_id = upla.package_list_id 
                WHERE upla.user_id = ? AND l.is_deleted = 0
            `).all(effectiveUserId) as Lab[];
        }

        labs.forEach(lab => {
            lab.assigned_list_ids = db.prepare('SELECT package_list_id from lab_package_lists WHERE lab_id = ?').all(lab.id).map((r: any) => r.package_list_id);
        });
        res.json(labs);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});
router.get('/package-lists', isAdmin, (req, res) => {
    try {
        const lists = db.prepare(`
            SELECT p.*, 
                (SELECT COUNT(*) FROM packages WHERE package_list_id = p.id) as package_count,
                (SELECT COUNT(*) FROM packages WHERE package_list_id = p.id AND (mrp <= 0 OR b2b_price <= 0 OR b2b_price < mrp)) as unconfigured_pricing_count
            FROM package_lists p
        `).all() as any[];

        // Fetch all master packages
        const masterPackages = db.prepare('SELECT id, name, code_name FROM master_packages').all() as any[];

        const enriched = lists.map(list => {
            const isMother = list.name.includes('Mother Ratelist') || list.name.includes('[M]');
            let missingMasterPackages: string[] = [];

            if (isMother && masterPackages.length > 0) {
                // Get all package names and code_names in this list
                const listPackages = db.prepare('SELECT name, code_name FROM packages WHERE package_list_id = ?').all(list.id) as any[];
                const listNamesSet = new Set(listPackages.map(p => p.name.trim().toUpperCase()));
                const listCodesSet = new Set(listPackages.filter(p => p.code_name).map(p => p.code_name.trim().toUpperCase()));

                // For each master package, check if in list
                masterPackages.forEach(mp => {
                    const mpName = mp.name.trim().toUpperCase();
                    if (listNamesSet.has(mpName)) return;
                    if (mp.code_name && listCodesSet.has(mp.code_name.trim().toUpperCase())) return;

                    // Check aliases
                    const aliases = db.prepare('SELECT alias_name FROM master_package_aliases WHERE master_package_id = ?').all(mp.id) as any[];
                    const hasAlias = aliases.some(a => listNamesSet.has(a.alias_name.trim().toUpperCase()));
                    if (!hasAlias) {
                        missingMasterPackages.push(mp.name);
                    }
                });
            }

            return {
                ...list,
                is_mother_ratelist: isMother,
                missing_master_count: missingMasterPackages.length,
                missing_master_packages: missingMasterPackages,
                has_red_outline: isMother && missingMasterPackages.length > 0,
                has_yellow_outline: (list.unconfigured_pricing_count || 0) > 0
            };
        });

        res.json(enriched);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// --- MASTER PACKAGES & ALIASES ENDPOINTS ---

router.get('/master-packages', isAuthenticated, (req, res) => {
    try {
        const packages = db.prepare(`
            SELECT mp.*, 
                (SELECT COUNT(*) FROM master_package_aliases WHERE master_package_id = mp.id) as alias_count,
                (SELECT GROUP_CONCAT(alias_name, ', ') FROM master_package_aliases WHERE master_package_id = mp.id) as aliases
            FROM master_packages mp
            ORDER BY mp.name ASC
        `).all();
        res.json(packages);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/master-packages', isAdmin, (req, res) => {
    try {
        const { name, code_name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: "Package name is required" });
        const cleanName = name.trim().toUpperCase();
        const now = new Date().toISOString();
        const stmt = db.prepare('INSERT INTO master_packages (name, code_name, created_at) VALUES (?, ?, ?)');
        const result = stmt.run(cleanName, code_name ? code_name.trim().toUpperCase() : null, now);
        res.status(201).json({ id: result.lastInsertRowid, name: cleanName, code_name });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/master-packages/:id', isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM master_packages WHERE id = ?').run(req.params.id);
        res.status(204).end();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/master-packages/:id/aliases', isAdmin, (req, res) => {
    try {
        const { alias_name } = req.body;
        if (!alias_name || !alias_name.trim()) return res.status(400).json({ message: "Alias name is required" });
        const cleanAlias = alias_name.trim().toUpperCase();
        const stmt = db.prepare('INSERT OR IGNORE INTO master_package_aliases (master_package_id, alias_name) VALUES (?, ?)');
        stmt.run(req.params.id, cleanAlias);
        res.status(201).json({ message: "Alias linked successfully", alias: cleanAlias });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/package-lists/:id/accept-master-packages', isAdmin, (req, res) => {
    const listId = parseInt(req.params.id, 10);
    const { package_names } = req.body;
    if (!package_names || (Array.isArray(package_names) && package_names.length === 0)) {
        return res.status(400).json({ message: "No package names specified" });
    }
    const names = Array.isArray(package_names) ? package_names : [package_names];
    try {
        const tx = db.transaction(() => {
            const insert = db.prepare('INSERT INTO packages (name, mrp, b2b_price, code_name, package_list_id) VALUES (?, 0, 0, ?, ?)');
            const selectExisting = db.prepare('SELECT id FROM packages WHERE package_list_id = ? AND UPPER(TRIM(name)) = UPPER(TRIM(?))');
            const selectMaster = db.prepare('SELECT code_name FROM master_packages WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))');
            let inserted = 0;
            names.forEach((rawName: string) => {
                const name = rawName.trim().toUpperCase();
                if (!name) return;
                const existing = selectExisting.get(listId, name);
                if (!existing) {
                    const master = selectMaster.get(name) as { code_name?: string } | undefined;
                    insert.run(name, master?.code_name || null, listId);
                    inserted++;
                }
            });
            return inserted;
        });
        const count = tx();
        res.json({ message: `Successfully inserted ${count} packages into rate list`, count });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// --- DOCTOR AUTOCOMPLETE & ADMIN SETTINGS ---

router.get('/doctors', isAuthenticated, (req, res) => {
    try {
        const doctors = db.prepare('SELECT name FROM doctors ORDER BY name ASC').all().map((d: any) => d.name);
        res.json(doctors);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/admin/settings', isAdmin, (req, res) => {
    try {
        let settings = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get();
        if (!settings) {
            db.prepare("INSERT INTO admin_settings (id, upi_id, organization_name, lab_name) VALUES (1, '', 'Studio Kivx Labs', 'Project LISP')").run();
            settings = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get();
        }
        res.json(settings);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put('/admin/settings', isAdmin, (req, res) => {
    try {
        const { upi_id, organization_name, lab_name } = req.body;
        db.prepare('UPDATE admin_settings SET upi_id = ?, organization_name = ?, lab_name = ? WHERE id = 1')
            .run(upi_id || '', organization_name || '', lab_name || '');
        res.json({ message: "Settings updated successfully" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/client-wallets', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    if (user.role !== 'ADMIN' && !user.master_data_entry) {
        return res.status(403).json({ message: "Forbidden: Master Data Entry access required." });
    }
    const query = req.query.q as string;
    let clients;
    if (query) {
        const searchTerm = `%${query}%`;
        const idQuery = parseInt(query, 10);
        if (!isNaN(idQuery)) {
            clients = db.prepare("SELECT * FROM users WHERE role = 'CLIENT' AND (username LIKE ? OR alias LIKE ? OR id = ?)").all(searchTerm, searchTerm, idQuery);
        } else {
            clients = db.prepare("SELECT * FROM users WHERE role = 'CLIENT' AND (username LIKE ? OR alias LIKE ?)").all(searchTerm, searchTerm);
        }
    } else {
        clients = db.prepare("SELECT * FROM users WHERE role = 'CLIENT'").all();
    }
    res.json(clients);
});

// --- ADMIN GET ROUTES (continued) ---

router.get('/customers', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    try {
        const query = (user.role === 'ADMIN' || user.role === 'GENERAL_EMPLOYEE' || user.role === 'DATA_ENTRY')
            ? `SELECT * FROM customers WHERE is_deleted = 0 ORDER BY id DESC`
            : `SELECT * FROM customers WHERE is_deleted = 0 AND (created_by_user_id = ? OR id IN (SELECT customer_id FROM receipts WHERE created_by_user_id = ? OR acting_as_client_id = ?) OR id IN (SELECT customer_id FROM estimates WHERE created_by_user_id = ?)) ORDER BY id DESC`;
        const params = (user.role === 'ADMIN' || user.role === 'GENERAL_EMPLOYEE' || user.role === 'DATA_ENTRY')
            ? []
            : [user.id, user.id, user.id, user.id];
        const customers = db.prepare(query).all(...params) as Customer[];
        const formattedCustomers: FormattedCustomer[] = customers.map((c: Customer) => ({
            ...c,
            display_id: `CUST-${String(c.id).padStart(10, '0')}`,
            dob_formatted: c.dob ? new Date(c.dob).toLocaleDateString('en-GB') : 'N/A',
            display_age: c.age_years !== null ? `${c.age_years}Y ${c.age_months || '0'}M ${c.age_days || '0'}D` : (c.age ? `${c.age} yrs` : 'N/A'),
            display_created_at: c.created_at.split(' | ')[0]
        }));
        res.json(formattedCustomers);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

function getReceiptMotherB2BCost(receiptId: number): number {
    let totalMotherB2B = 0;
    try {
        const items = db.prepare('SELECT package_name, package_list_id FROM receipt_items WHERE receipt_id = ?').all(receiptId) as any[];
        
        items.forEach(item => {
            let motherPrice: number | undefined = undefined;

            if (item.package_list_id) {
                // 1. Find lab_id for this package_list_id
                const labMapping = db.prepare('SELECT lab_id FROM lab_package_lists WHERE package_list_id = ?').get(item.package_list_id) as { lab_id: number } | undefined;
                
                if (labMapping) {
                    // 2. Find the Mother Rate List for this lab
                    const motherList = db.prepare(`
                        SELECT pl.id, pl.name 
                        FROM package_lists pl 
                        JOIN lab_package_lists lpl ON pl.id = lpl.package_list_id 
                        WHERE lpl.lab_id = ? AND (pl.name LIKE '%Mother Ratelist%' OR pl.name LIKE '%[M]%')
                        ORDER BY pl.id DESC LIMIT 1
                    `).get(labMapping.lab_id) as { id: number; name: string } | undefined;

                    if (motherList) {
                        // 3. Find price in Mother List: exact match first
                        const motherPkg = db.prepare('SELECT b2b_price FROM packages WHERE package_list_id = ? AND UPPER(TRIM(name)) = UPPER(TRIM(?))')
                            .get(motherList.id, item.package_name) as { b2b_price: number } | undefined;
                        if (motherPkg) {
                            motherPrice = motherPkg.b2b_price;
                        } else {
                            // Check alias or code_name match
                            const aliasPkg = db.prepare(`
                                SELECT p.b2b_price FROM packages p 
                                WHERE p.package_list_id = ? AND (
                                    p.name IN (
                                        SELECT mp.name FROM master_packages mp 
                                        JOIN master_package_aliases mpa ON mp.id = mpa.master_package_id 
                                        WHERE UPPER(TRIM(mpa.alias_name)) = UPPER(TRIM(?))
                                    )
                                    OR (p.code_name IS NOT NULL AND p.code_name = (
                                        SELECT code_name FROM packages WHERE package_list_id = ? AND UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1
                                    ))
                                ) LIMIT 1
                            `).get(motherList.id, item.package_name, item.package_list_id, item.package_name) as { b2b_price: number } | undefined;
                            if (aliasPkg) {
                                motherPrice = aliasPkg.b2b_price;
                            }
                        }
                    }
                }
            }

            // Fallback: If not found in Mother List, check the item's rate list price
            if (motherPrice === undefined && item.package_list_id) {
                const itemPkg = db.prepare('SELECT b2b_price FROM packages WHERE package_list_id = ? AND UPPER(TRIM(name)) = UPPER(TRIM(?))')
                    .get(item.package_list_id, item.package_name) as { b2b_price: number } | undefined;
                if (itemPkg) motherPrice = itemPkg.b2b_price;
            }

            if (typeof motherPrice === 'number') {
                totalMotherB2B += motherPrice;
            }
        });
    } catch (err) {
        console.error("Failed to compute mother B2B cost for receipt:", receiptId, err);
    }
    return totalMotherB2B;
}

router.get('/receipts', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    try {
        let receipts;
        if (user.role === 'CLIENT') {
            receipts = db.prepare(`
                SELECT r.id, r.created_at, c.name as customer_name, c.id as customer_id, c.prefix, r.amount_final, r.total_mrp, r.payment_method, r.referred_by, r.num_tests,
                       u.alias as user_alias, u.username as username, r.acting_as_client_id, r.created_by_user_id,
                       cl.alias as client_alias, cl.username as client_username,
                       (SELECT amount_deducted FROM transactions WHERE receipt_id = r.id AND type = 'RECEIPT_DEDUCTION') AS b2b_cost
                FROM receipts r 
                JOIN customers c ON r.customer_id = c.id 
                JOIN users u ON r.created_by_user_id = u.id 
                LEFT JOIN users cl ON r.acting_as_client_id = cl.id
                WHERE r.created_by_user_id = ? OR r.acting_as_client_id = ?
                ORDER BY r.id DESC
            `).all(user.id, user.id) as any[];
        } else {
            receipts = db.prepare(`
                SELECT r.id, r.created_at, c.name as customer_name, c.id as customer_id, c.prefix, r.amount_final, r.total_mrp, r.payment_method, r.referred_by, r.num_tests,
                       u.alias as user_alias, u.username as username, r.acting_as_client_id, r.created_by_user_id,
                       cl.alias as client_alias, cl.username as client_username,
                       (SELECT amount_deducted FROM transactions WHERE receipt_id = r.id AND type = 'RECEIPT_DEDUCTION') AS b2b_cost
                FROM receipts r 
                JOIN customers c ON r.customer_id = c.id 
                JOIN users u ON r.created_by_user_id = u.id 
                LEFT JOIN users cl ON r.acting_as_client_id = cl.id
                ORDER BY r.id DESC
            `).all() as any[];
        }
        const formatted = receipts.map(r => {
            let creator = r.user_alias || r.username;
            if (r.acting_as_client_id) {
                const clientName = r.client_alias || r.client_username;
                creator = `${clientName} [M.ENTRY BY - ${creator}]`;
            }

            // Resolve Associated Lab Info dynamically using 3-step prioritized query
            let labInfo = db.prepare(`
                SELECT DISTINCT l.id as lab_id, l.name as lab_name
                FROM labs l
                JOIN lab_package_lists lpl ON l.id = lpl.lab_id
                JOIN receipt_items ri ON lpl.package_list_id = ri.package_list_id
                WHERE ri.receipt_id = ? AND ri.package_list_id IS NOT NULL
                LIMIT 1
            `).get(r.id) as { lab_id: number; lab_name: string } | undefined;

            if (!labInfo) {
                labInfo = db.prepare(`
                    SELECT DISTINCT l.id as lab_id, l.name as lab_name
                    FROM labs l
                    JOIN lab_package_lists lpl ON l.id = lpl.lab_id
                    JOIN package_lists pl ON lpl.package_list_id = pl.id
                    JOIN user_package_list_access upla ON pl.id = upla.package_list_id
                    JOIN packages p ON pl.id = p.package_list_id
                    JOIN receipt_items ri ON p.name = ri.package_name
                    WHERE ri.receipt_id = ? AND upla.user_id = COALESCE(?, ?)
                    LIMIT 1
                `).get(r.id, r.acting_as_client_id, r.created_by_user_id) as { lab_id: number; lab_name: string } | undefined;
            }

            if (!labInfo) {
                labInfo = db.prepare(`
                    SELECT DISTINCT l.id as lab_id, l.name as lab_name
                    FROM labs l
                    JOIN lab_package_lists lpl ON l.id = lpl.lab_id
                    JOIN package_lists pl ON lpl.package_list_id = pl.id
                    JOIN packages p ON pl.id = p.package_list_id
                    JOIN receipt_items ri ON p.name = ri.package_name
                    WHERE ri.receipt_id = ?
                    LIMIT 1
                `).get(r.id) as { lab_id: number; lab_name: string } | undefined;
            }

            const receiptItems = db.prepare('SELECT ri.id, ri.package_name, ri.mrp, ri.discount_percentage, ri.package_list_id FROM receipt_items ri WHERE ri.receipt_id = ?').all(r.id) as any[];
            const testNames = receiptItems.map(i => i.package_name).join(', ');

            return {
                id: r.id,
                display_doc_id: `RCPT-${String(r.id).padStart(6, '0')}`,
                display_date: `${r.created_at.split(' | ')[0]} ${r.created_at.split(' | ')[1]}`,
                customer_name: `${r.prefix || ''} ${r.customer_name}`,
                display_customer_id: `CUST-${String(r.customer_id).padStart(10, '0')}`,
                customer_id: r.customer_id,
                display_amount: `₹${r.amount_final.toFixed(2)}`,
                amount_final: r.amount_final,
                total_mrp: r.total_mrp,
                b2b_cost: r.b2b_cost || 0,
                mother_b2b_cost: getReceiptMotherB2BCost(r.id),
                payment_method: r.payment_method,
                created_by_user: creator,
                acting_as_client_id: r.acting_as_client_id || undefined,
                created_by_user_id: r.created_by_user_id,
                referred_by: r.referred_by || 'Self',
                num_tests: r.num_tests || 0,
                lab_name: labInfo?.lab_name || 'N/A',
                test_names: testNames,
                items: receiptItems
            };
        });
        res.json(formatted);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/admin/estimates', isAdmin, (req, res) => {
    try {
        const estimates = db.prepare(`
            SELECT e.id, e.created_at, c.name as customer_name, c.id as customer_id, c.prefix, e.amount_after_discount, u.alias as user_alias, u.username as username
            FROM estimates e JOIN customers c ON e.customer_id = c.id JOIN users u ON e.created_by_user_id = u.id ORDER BY e.id DESC
        `).all() as any[];
        const formatted: Document[] = estimates.map(e => ({
            id: e.id,
            display_doc_id: `EST-${String(e.id).padStart(6, '0')}`,
            display_date: `${e.created_at.split(' | ')[0]} ${e.created_at.split(' | ')[1]}`,
            customer_name: `${e.prefix || ''} ${e.customer_name}`,
            display_customer_id: `CUST-${String(e.customer_id).padStart(10, '0')}`,
            display_amount: `₹${e.amount_after_discount.toFixed(2)}`,
            created_by_user: e.user_alias || e.username
        }));
        res.json(formatted);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// --- ADMIN C-UD (CREATE, UPDATE, DELETE) ROUTES ---

// Users Management
router.get('/users/:id', isAdmin, (req, res) => {
    try {
        const user = db.prepare('SELECT id, username, alias, branchId, role, master_data_entry, wallet_balance, allow_negative_balance, negative_balance_allowed_until FROM users WHERE id = ?').get(req.params.id) as User;
        if (user) {
            user.assigned_list_ids = db.prepare('SELECT package_list_id FROM user_package_list_access WHERE user_id = ?').all(req.params.id).map((r: any) => r.package_list_id);
        }
        res.json(user);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/users', isAdmin, (req, res) => {
    const { username, alias, password, password_hash, branchId, role, assigned_list_ids, master_data_entry } = req.body;
    const plainPassword = password || password_hash;
    const passwordHashed = bcrypt.hashSync(plainPassword, 10);
    const transaction = db.transaction(() => {
        const result = db.prepare('INSERT INTO users (username, alias, password_hash, branchId, role, master_data_entry) VALUES (?, ?, ?, ?, ?, ?)').run(username, alias, passwordHashed, branchId, role, master_data_entry ? 1 : 0);
        const userId = result.lastInsertRowid;
        const insertAccess = db.prepare('INSERT INTO user_package_list_access (user_id, package_list_id) VALUES (?, ?)');
        assigned_list_ids.forEach((listId: number) => insertAccess.run(userId, listId));
    });
    try {
        transaction();
        res.status(201).json({ message: 'User created successfully' });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put('/users/:id', isAdmin, (req, res) => {
    const { username, alias, password, password_hash, branchId, role, assigned_list_ids, master_data_entry } = req.body;
    const plainPassword = password || password_hash;
    const transaction = db.transaction(() => {
        if (plainPassword) {
            const passwordHashed = bcrypt.hashSync(plainPassword, 10);
            db.prepare('UPDATE users SET username=?, alias=?, password_hash=?, branchId=?, role=?, master_data_entry=? WHERE id=?').run(username, alias, passwordHashed, branchId, role, master_data_entry ? 1 : 0, req.params.id);
        } else {
            db.prepare('UPDATE users SET username=?, alias=?, branchId=?, role=?, master_data_entry=? WHERE id=?').run(username, alias, branchId, role, master_data_entry ? 1 : 0, req.params.id);
        }
        db.prepare('DELETE FROM user_package_list_access WHERE user_id = ?').run(req.params.id);
        const insertAccess = db.prepare('INSERT INTO user_package_list_access (user_id, package_list_id) VALUES (?, ?)');
        (assigned_list_ids || []).forEach((listId: number) => insertAccess.run(req.params.id, listId));
    });
    try {
        transaction();
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/users/:id', isAdmin, (req, res) => {
    const targetUserId = req.params.id;
    try {
        // Prevent self-deletion
        if ((req.session as any).user.id == targetUserId) {
            return res.status(400).json({ message: "You cannot delete your own account." });
        }

        const transaction = db.transaction(() => {
            // 1. Ensure dummy "deleted_user" exists to attribute receipts/ledger history to
            let dummyUserId;
            const dummyUser = db.prepare("SELECT id FROM users WHERE username = 'deleted_user'").get() as { id: number } | undefined;
            if (!dummyUser) {
                const firstBranch = db.prepare('SELECT id FROM branches LIMIT 1').get() as { id: number } | undefined;
                const branchId = firstBranch ? firstBranch.id : 1;
                const run = db.prepare("INSERT INTO users (username, password_hash, branchId, role, wallet_balance) VALUES (?, ?, ?, ?, ?)").run('deleted_user', 'DISABLED', branchId, 'GENERAL_EMPLOYEE', 0);
                dummyUserId = run.lastInsertRowid;
            } else {
                dummyUserId = dummyUser.id;
            }

            // Prevent deleting the dummy deleted_user
            if (Number(targetUserId) === Number(dummyUserId)) {
                throw new Error("Cannot delete the system archive account.");
            }

            // 2. Re-attribute associated data to dummy user or NULL to satisfy foreign key constraints
            db.prepare('UPDATE receipts SET created_by_user_id = ? WHERE created_by_user_id = ?').run(dummyUserId, targetUserId);
            db.prepare('UPDATE receipts SET acting_as_client_id = NULL WHERE acting_as_client_id = ?').run(targetUserId);
            db.prepare('UPDATE customers SET created_by_user_id = ? WHERE created_by_user_id = ?').run(dummyUserId, targetUserId);
            db.prepare('UPDATE estimates SET created_by_user_id = ? WHERE created_by_user_id = ?').run(dummyUserId, targetUserId);
            db.prepare('UPDATE transactions SET user_id = ? WHERE user_id = ?').run(dummyUserId, targetUserId);

            // 3. Delete the actual user
            db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
        });

        transaction();
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Branch Management
router.post('/branches', isAdmin, (req, res) => {
    const { name, address, phone } = req.body;
    try {
        db.prepare('INSERT INTO branches (name, address, phone) VALUES (?, ?, ?)').run(name, address, phone);
        res.status(201).json({ message: 'Branch created' });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put('/branches/:id', isAdmin, (req, res) => {
    const { name, address, phone } = req.body;
    try {
        db.prepare('UPDATE branches SET name=?, address=?, phone=? WHERE id=?').run(name, address, phone, req.params.id);
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/labs', isAdmin, (req, res) => {
    const { name } = req.body;
    try {
        const result = db.transaction(() => {
            const labRun = db.prepare('INSERT INTO labs (name) VALUES (?)').run(name);
            const labId = labRun.lastInsertRowid;
            
            // Auto create Mother Ratelist
            const listName = `${name} Mother Ratelist`;
            const listRun = db.prepare('INSERT INTO package_lists (name) VALUES (?)').run(listName);
            const listId = listRun.lastInsertRowid;
            
            // Map the list to the lab
            db.prepare('INSERT INTO lab_package_lists (lab_id, package_list_id) VALUES (?, ?)').run(labId, listId);
            
            return { labId, listId };
        })();
        res.status(201).json({ message: 'Lab created and Mother Ratelist mapped', ...result });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/labs/:id', isAdmin, (req, res) => {
    const labId = parseInt(req.params.id, 10);
    if (isNaN(labId)) {
        return res.status(400).json({ message: "Invalid Lab ID" });
    }
    try {
        const transaction = db.transaction(() => {
            const lab = db.prepare('SELECT name FROM labs WHERE id = ?').get(labId) as { name: string } | undefined;
            if (!lab) throw new Error("Lab not found");
            
            const timestamp = Math.floor(Date.now() / 1000);
            const deletedLabName = `[DELETED] ${lab.name}_${timestamp}`;
            
            // 1. Rename and soft-delete the lab
            db.prepare('UPDATE labs SET name = ?, is_deleted = 1 WHERE id = ?').run(deletedLabName, labId);
            
            // 2. Rename associated package lists to free up unique name constraints
            const lists = db.prepare('SELECT pl.id, pl.name FROM package_lists pl JOIN lab_package_lists lpl ON pl.id = lpl.package_list_id WHERE lpl.lab_id = ?').all(labId) as any[];
            const renameListStmt = db.prepare('UPDATE package_lists SET name = ? WHERE id = ?');
            
            lists.forEach(list => {
                const deletedListName = `[DELETED] ${list.name}_${timestamp}`;
                renameListStmt.run(deletedListName, list.id);
            });
        });
        transaction();
        res.status(204).send();
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

router.put('/labs/:id/lists', isAdmin, (req, res) => {
    const labId = req.params.id;
    const listIds = req.body.listIds as number[];
    const transaction = db.transaction(() => {
        db.prepare('DELETE FROM lab_package_lists WHERE lab_id = ?').run(labId);
        const insert = db.prepare('INSERT INTO lab_package_lists (lab_id, package_list_id) VALUES (?, ?)');
        listIds.forEach(listId => insert.run(labId, listId));
    });
    try {
        transaction();
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put('/labs/:id/logo', isAdmin, (req, res) => {
    const parsedLabId = parseInt(req.params.id, 10);
    if (isNaN(parsedLabId)) {
        return res.status(400).json({ message: "Invalid Lab ID" });
    }
    const { logoBase64 } = req.body;

    if (!logoBase64) return res.status(400).json({ message: "Logo data is required" });

    try {
        // Extract base64 content
        const matches = logoBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ message: "Invalid base64 string" });
        }

        const mimeType = matches[1];
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(mimeType)) {
            return res.status(400).json({ message: "Disallowed file type. Only JPEG, PNG, GIF, and WEBP are allowed." });
        }

        const extension = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const fileName = `lab_${parsedLabId}_${Date.now()}.${extension}`;
        const relativePath = `/lab_logos/${fileName}`;
        const absolutePath = path.join(__dirname, '..', '..', 'public', 'lab_logos', fileName);

        // Ensure directory exists
        const dir = path.dirname(absolutePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(absolutePath, buffer);

        // Update database
        db.prepare('UPDATE labs SET logo_path = ? WHERE id = ?').run(relativePath, parsedLabId);

        res.json({ logoPath: relativePath });
    } catch (error: any) {
        console.error("Upload failed:", error);
        res.status(500).json({ message: "Failed to upload logo: " + error.message });
    }
});

// Package List & Package Management
router.post('/package-lists', isAdmin, (req, res) => {
    try {
        const result = db.prepare('INSERT INTO package_lists (name) VALUES (?)').run(req.body.name);
        res.status(201).json({ id: result.lastInsertRowid, message: 'List created' });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/package-lists/:id', isAdmin, (req, res) => {
    const listId = req.params.id;
    try {
        // Prevent deletion if the rate list is currently assigned to one or more B2B clients
        const userRef = db.prepare('SELECT COUNT(*) as count FROM user_package_list_access WHERE package_list_id = ?').get(listId) as { count: number };
        if (userRef && userRef.count > 0) {
            return res.status(400).json({ message: "Cannot delete rate list because it is currently assigned to one or more B2B clients. Please unassign it first." });
        }

        // Prevent deletion if the rate list is referenced in existing billing/receipt history
        const refCount = db.prepare('SELECT COUNT(*) as count FROM receipt_items WHERE package_list_id = ?').get(listId) as { count: number };
        if (refCount && refCount.count > 0) {
            return res.status(400).json({ message: "Cannot delete rate list because it is referenced in existing patient receipts/billing history." });
        }

        db.prepare('DELETE FROM package_lists WHERE id = ?').run(listId);
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/package-lists/:id/upload', isAdmin, (req, res) => {
    const listId = req.params.id;
    const packages = req.body.packages as any[];
    const mode = req.body.mode || 'OVERWRITE'; // Default to OVERWRITE per Tathagata's request
    const transaction = db.transaction(() => {
        let inserted = 0, updated = 0;
        if (mode === 'OVERWRITE') {
            db.prepare('DELETE FROM packages WHERE package_list_id = ?').run(listId);
            const insertPkg = db.prepare('INSERT INTO packages (name, mrp, b2b_price, code_name, package_list_id) VALUES (?, ?, ?, ?, ?)');
            packages.forEach(pkg => {
                insertPkg.run(pkg.name, pkg.mrp, pkg.b2b_price, pkg.code_name || null, listId);
                inserted++;
            });
        } else {
            const selectPkg = db.prepare('SELECT id FROM packages WHERE package_list_id = ? AND name = ?');
            const updatePkg = db.prepare('UPDATE packages SET mrp = ?, b2b_price = ?, code_name = ? WHERE id = ?');
            const insertPkg = db.prepare('INSERT INTO packages (name, mrp, b2b_price, code_name, package_list_id) VALUES (?, ?, ?, ?, ?)');
            packages.forEach(pkg => {
                const existing = selectPkg.get(listId, pkg.name) as Package;
                const code = pkg.code_name || null;
                if (existing) {
                    updatePkg.run(pkg.mrp, pkg.b2b_price, code, existing.id);
                    updated++;
                } else {
                    insertPkg.run(pkg.name, pkg.mrp, pkg.b2b_price, code, listId);
                    inserted++;
                }
            });
        }
        return { inserted, updated };
    });
    try {
        res.json(transaction());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/package-lists/:id/clone', isAdmin, (req, res) => {
    const targetListId = parseInt(req.params.id, 10);
    const { sourceListId, discountPercent, markupPercent } = req.body;
    
    if (isNaN(targetListId)) {
        return res.status(400).json({ message: "Invalid target list ID." });
    }
    
    try {
        const transaction = db.transaction(() => {
            // Verify target exists
            const target = db.prepare('SELECT id FROM package_lists WHERE id = ?').get(targetListId);
            if (!target) throw new Error("Target package list not found.");
            
            // Verify source exists
            const source = db.prepare('SELECT id FROM package_lists WHERE id = ?').get(sourceListId);
            if (!source) throw new Error("Source package list not found.");
            
            // Clear existing target packages
            db.prepare('DELETE FROM packages WHERE package_list_id = ?').run(targetListId);
            
            // Fetch packages
            const pkgs = db.prepare('SELECT name, mrp, b2b_price, code_name FROM packages WHERE package_list_id = ?').all(sourceListId) as Package[];
            
            // Apply multipliers
            const disc = parseFloat(discountPercent) || 0;
            const mark = parseFloat(markupPercent) || 0;
            const multiplier = 1 - (disc / 100) + (mark / 100);
            
            const insertStmt = db.prepare('INSERT INTO packages (name, mrp, b2b_price, code_name, package_list_id) VALUES (?, ?, ?, ?, ?)');
            
            pkgs.forEach(p => {
                const finalB2B = Math.ceil(Math.max(0, p.b2b_price * multiplier));
                insertStmt.run(p.name, p.mrp, finalB2B, p.code_name || null, targetListId);
            });
            
            return pkgs.length;
        });
        
        const copied = transaction();
        res.json({ message: `Success: Copied and synced ${copied} packages successfully.` });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/packages', isAdmin, (req, res) => {
    const { name, mrp, b2b_price, code_name, package_list_id } = req.body;
    try {
        const result = db.prepare('INSERT INTO packages (name, mrp, b2b_price, code_name, package_list_id) VALUES (?, ?, ?, ?, ?)').run(name, mrp, b2b_price, code_name || null, package_list_id);
        res.status(201).json({ id: result.lastInsertRowid, ...req.body });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put('/packages/:id', isAdmin, (req, res) => {
    const { name, mrp, b2b_price, code_name } = req.body;
    try {
        db.prepare('UPDATE packages SET name = ?, mrp = ?, b2b_price = ?, code_name = ? WHERE id = ?').run(name, mrp, b2b_price, code_name || null, req.params.id);
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/packages/:id', isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/package-lists/auto-create-client-list', isAdmin, (req, res) => {
    const { username, labId } = req.body;
    try {
        const transaction = db.transaction(() => {
            const listRun = db.prepare('INSERT INTO package_lists (name) VALUES (?)').run(username);
            const listId = listRun.lastInsertRowid;
            db.prepare('INSERT INTO lab_package_lists (lab_id, package_list_id) VALUES (?, ?)').run(labId, listId);
            return listId;
        });
        const newListId = transaction();
        res.status(201).json({ id: newListId, name: username });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put('/package-lists/:id', isAdmin, (req, res) => {
    const { name } = req.body;
    try {
        db.prepare('UPDATE package_lists SET name = ? WHERE id = ?').run(name, req.params.id);
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Wallet Management
router.put('/wallets/update', isAdmin, (req, res) => {
    const { clientId, action, amount, notes } = req.body;
    const transaction = db.transaction(() => {
        const client = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(clientId) as User;
        if (!client) throw new Error("Client not found");
        let amountChange = 0;
        let type: Transaction['type'] = 'ADMIN_CREDIT';
        if (action === 'add') {
            amountChange = Number(amount);
            type = 'ADMIN_CREDIT';
        } else if (action === 'deduct') {
            amountChange = -Number(amount);
            type = 'ADMIN_DEBIT';
        } else if (action === 'settle') {
            amountChange = -client.wallet_balance;
            type = 'SETTLEMENT';
        }
        db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amountChange, clientId);

        const newBalanceObj = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(clientId) as { wallet_balance: number };

        db.prepare('INSERT INTO transactions (user_id, date, type, amount_deducted, balance_snapshot, notes) VALUES (?, ?, ?, ?, ?, ?)')
            .run(clientId, getISTDateTimeString(), type, -amountChange, newBalanceObj.wallet_balance, notes);
    });
    try {
        transaction();
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put('/wallets/permissions', isAdmin, (req, res) => {
    const { clientId, allow, until } = req.body;
    try {
        db.prepare('UPDATE users SET allow_negative_balance = ?, negative_balance_allowed_until = ? WHERE id = ?').run(allow ? 1 : 0, allow ? until : null, clientId);
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Customer Management
router.get('/customers/:id', isAdmin, (req, res) => {
    try {
        res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put('/customers/:id', isAdmin, (req, res) => {
    const { prefix, name, mobile, email, dob, age, age_years, age_months, age_days, gender } = req.body;
    try {
        db.prepare('UPDATE customers SET prefix=?, name=?, mobile=?, email=?, dob=?, age=?, age_years=?, age_months=?, age_days=?, gender=?, updated_at=? WHERE id=?')
            .run(prefix, name ? name.trim().toUpperCase() : '', mobile, email, dob, age, age_years, age_months, age_days, gender, getISTDateTimeString(), req.params.id);
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// --- TRANSACTION & DOCUMENT MANAGEMENT (ADMIN ONLY) ---

router.delete('/admin/transactions/:id/revert', isAdmin, (req, res) => {
    try {
        const transactionResult = db.transaction(() => {
            const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as Transaction;
            if (!tx) throw new Error("Transaction not found");

            // 1. If it's a receipt deduction, delete the receipt and its items
            if (tx.type === 'RECEIPT_DEDUCTION' && tx.receipt_id) {
                db.prepare('DELETE FROM receipts WHERE id = ?').run(tx.receipt_id);
            }

            // 2. Revert wallet balance
            if (tx.type === 'SETTLEMENT') {
                db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run((tx.balance_snapshot || 0) + tx.amount_deducted, tx.user_id);
            } else {
                db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(tx.amount_deducted, tx.user_id);
            }

            // 3. Delete the transaction record
            db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
        });
        transactionResult();
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/admin/transactions/:id/delete', isAdmin, (req, res) => {
    try {
        const transactionResult = db.transaction(() => {
            const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as Transaction;
            if (!tx) throw new Error("Transaction not found");

            // 1. Revert wallet balance
            db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(tx.amount_deducted, tx.user_id);

            // 2. Delete transaction record (Keep the receipt!)
            db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
        });
        transactionResult();
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/admin/receipts/:id', isAdmin, (req, res) => {
    try {
        const transactionResult = db.transaction(() => {
            const tx = db.prepare('SELECT * FROM transactions WHERE receipt_id = ?').get(req.params.id) as Transaction;
            if (tx) {
                db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(tx.amount_deducted, tx.user_id);
                db.prepare('DELETE FROM transactions WHERE id = ?').run(tx.id);
            }
            db.prepare('DELETE FROM receipts WHERE id = ?').run(req.params.id);
        });
        transactionResult();
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/admin/receipts/:id/revert', isAdmin, (req, res) => {
    try {
        const transactionResult = db.transaction(() => {
            const tx = db.prepare('SELECT * FROM transactions WHERE receipt_id = ?').get(req.params.id) as Transaction;
            if (tx) {
                db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(tx.amount_deducted, tx.user_id);
                db.prepare('DELETE FROM transactions WHERE id = ?').run(tx.id);
            }
            db.prepare('DELETE FROM receipts WHERE id = ?').run(req.params.id);
        });
        transactionResult();
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/admin/customers/:id', isAdmin, (req, res) => {
    try {
        db.prepare('UPDATE customers SET is_deleted = 1 WHERE id = ?').run(req.params.id);
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/admin/transactions/user/:userId', isAdmin, (req, res) => {
    try {
        const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC').all(req.params.userId) as Transaction[];
        res.json(txs);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// --- LAB REPORTS ENDPOINTS ---

router.post('/reports/upload', isAdmin, (req, res, next) => {
    upload.single('report')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ message: err.message });
        }
        next();
    });
}, (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No PDF file uploaded.' });
    }
    const { client_id, customer_id, category } = req.body;
    if (!client_id || !customer_id || !category) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'Missing client_id, customer_id, or category.' });
    }

    try {
        const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(customer_id) as any;
        if (!customer) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Customer not found.' });
        }

        const relativePath = `/lab_reports/${req.file.filename}`;
        const result = db.prepare(`
            INSERT INTO lab_reports (client_id, customer_id, customer_name, category, file_path, uploaded_at) 
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(client_id, customer_id, customer.name, category, relativePath, getISTDateTimeString());

        res.status(201).json({
            message: 'Report uploaded successfully',
            reportId: result.lastInsertRowid
        });
    } catch (e: any) {
        fs.unlinkSync(req.file.path);
        res.status(500).json({ message: e.message });
    }
});

router.get('/reports', isAdmin, (req, res) => {
    try {
        const reports = db.prepare(`
            SELECT lr.*, u.alias, u.username 
            FROM lab_reports lr 
            JOIN users u ON lr.client_id = u.id 
            ORDER BY lr.id DESC
        `).all() as any[];

        res.json(reports);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/reports/client', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    if (user.role !== 'CLIENT') {
        return res.status(403).json({ message: 'Forbidden' });
    }
    try {
        const reports = db.prepare('SELECT * FROM lab_reports WHERE client_id = ? ORDER BY id DESC').all(user.id) as any[];
        res.json(reports);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/reports/:id/download', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    const reportId = req.params.id;

    try {
        const report = db.prepare('SELECT * FROM lab_reports WHERE id = ?').get(reportId) as any;
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // B2B franchise clients are only authorized to download their own files
        if (user.role === 'CLIENT' && report.client_id !== user.id) {
            return res.status(403).json({ message: 'Forbidden: Unauthorized report download.' });
        }

        // Enforce negative balance download blocks for B2B clients
        if (user.role === 'CLIENT') {
            const client = db.prepare('SELECT wallet_balance, allow_negative_balance, negative_balance_allowed_until FROM users WHERE id = ?').get(user.id) as any;
            if (client) {
                let isNegativeAllowed = false;
                if (client.wallet_balance >= 0) {
                    isNegativeAllowed = true;
                } else if (client.allow_negative_balance) {
                    if (client.negative_balance_allowed_until) {
                        const untilDate = new Date(client.negative_balance_allowed_until);
                        if (untilDate >= new Date()) {
                            isNegativeAllowed = true;
                        }
                    } else {
                        isNegativeAllowed = true;
                    }
                }

                if (!isNegativeAllowed) {
                    return res.status(403).json({ message: "Download blocked: Wallet account balance is negative." });
                }
            }
        }

        const absolutePath = path.join(__dirname, '..', '..', 'public', report.file_path);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ message: 'Report file not found on server.' });
        }

        // Dynamic renaming: CustomerName_category.pdf
        const sanitizedCustomerName = report.customer_name.replace(/[^a-zA-Z0-9]/g, '_');
        const sanitizedCategory = (report.category || 'report').toLowerCase().replace(/\s+/g, '_');
        const filename = `${sanitizedCustomerName}_${sanitizedCategory}.pdf`;

        const inline = req.query.inline === 'true';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `${inline ? 'inline' : 'attachment'}; filename="${filename}"`
        );

        // Mark report as read if client is retrieving it
        if (user.role === 'CLIENT' && !report.is_read) {
            db.prepare('UPDATE lab_reports SET is_read = 1 WHERE id = ?').run(reportId);
        }

        const fileStream = fs.createReadStream(absolutePath);
        fileStream.pipe(res);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

router.put('/reports/:id/read', isAuthenticated, (req, res) => {
    try {
        db.prepare('UPDATE lab_reports SET is_read = 1 WHERE id = ?').run(req.params.id);
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete('/reports/:id', isAdmin, (req, res) => {
    try {
        const report = db.prepare('SELECT file_path FROM lab_reports WHERE id = ?').get(req.params.id) as any;
        if (report) {
            const absolutePath = path.join(__dirname, '..', '..', 'public', report.file_path);
            if (fs.existsSync(absolutePath)) {
                fs.unlinkSync(absolutePath);
            }
            db.prepare('DELETE FROM lab_reports WHERE id = ?').run(req.params.id);
        }
        res.status(204).send();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// --- ESTIMATE COMPARISON ENDPOINTS ---

router.post('/comparison/upload', isAdmin, (req, res, next) => {
    excelUpload.single('sheet')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ message: err.message });
        }
        next();
    });
}, async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No Excel file uploaded.' });

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        const worksheet = workbook.worksheets[0];

        if (!worksheet) throw new Error("Excel file is empty");

        const headers: { [key: number]: string } = {};
        let isFirstRow = true;

        const transaction = db.transaction(() => {
            db.prepare('DELETE FROM comparison_prices').run();
            db.prepare('DELETE FROM comparison_tests').run();
            db.prepare('DELETE FROM comparison_labs').run();

            const insertTest = db.prepare('INSERT INTO comparison_tests (name) VALUES (?)');
            const insertLab = db.prepare('INSERT INTO comparison_labs (name) VALUES (?)');
            const insertPrice = db.prepare('INSERT INTO comparison_prices (test_id, lab_id, price) VALUES (?, ?, ?)');

            const labNameToId: { [key: string]: number } = {};

            worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                if (isFirstRow) {
                    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                        if (colNumber > 1) {
                            const labName = cell.value?.toString().trim() || `Lab ${colNumber}`;
                            headers[colNumber] = labName;

                            const result = insertLab.run(labName);
                            labNameToId[labName] = result.lastInsertRowid as number;
                        }
                    });
                    isFirstRow = false;
                } else {
                    const testName = row.getCell(1).value?.toString().trim();
                    if (!testName) return;

                    const testResult = insertTest.run(testName);
                    const testId = testResult.lastInsertRowid as number;

                    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                        if (colNumber > 1 && headers[colNumber]) {
                            const priceStr = cell.value?.toString().replace(/[^0-9.]/g, '');
                            const price = parseFloat(priceStr || '0');
                            const labId = labNameToId[headers[colNumber]];

                            if (labId && !isNaN(price)) {
                                insertPrice.run(testId, labId, price);
                            }
                        }
                    });
                }
            });
        });

        transaction();
        fs.unlinkSync(req.file.path);
        res.status(201).json({ message: 'Comparison data uploaded successfully' });
    } catch (e: any) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: `Upload failed: ${e.message}` });
    }
});

router.get('/comparison/data', isAuthenticated, (req, res) => {
    try {
        const masterPackages = db.prepare('SELECT id, name, code_name FROM master_packages ORDER BY name ASC').all() as any[];
        const labs = db.prepare('SELECT id, name FROM labs WHERE is_deleted = 0 ORDER BY id ASC').all() as any[];

        // Preload mother lists for all labs
        const labMotherLists: { [labId: number]: number } = {};
        labs.forEach(lab => {
            const mother = db.prepare(`
                SELECT pl.id FROM package_lists pl
                JOIN lab_package_lists lpl ON pl.id = lpl.package_list_id
                WHERE lpl.lab_id = ? AND (pl.name LIKE '%Mother Ratelist%' OR pl.name LIKE '%[M]%')
                ORDER BY pl.id DESC LIMIT 1
            `).get(lab.id) as { id: number } | undefined;
            if (mother) labMotherLists[lab.id] = mother.id;
        });

        // Preload all master package aliases
        const allAliases = db.prepare('SELECT master_package_id, alias_name FROM master_package_aliases').all() as any[];
        const aliasMap: { [mpId: number]: string[] } = {};
        allAliases.forEach(a => {
            if (!aliasMap[a.master_package_id]) aliasMap[a.master_package_id] = [];
            aliasMap[a.master_package_id].push(a.alias_name.trim().toUpperCase());
        });

        // Preload packages for all mother lists
        const motherPackagesByList: { [listId: number]: any[] } = {};
        Object.values(labMotherLists).forEach(listId => {
            motherPackagesByList[listId] = db.prepare('SELECT id, name, mrp, b2b_price, code_name FROM packages WHERE package_list_id = ?').all(listId) as any[];
        });

        const prices: any[] = [];

        labs.forEach(lab => {
            const motherListId = labMotherLists[lab.id];
            if (!motherListId) return;

            const listPkgs = motherPackagesByList[motherListId] || [];
            const pkgByName: { [name: string]: any } = {};
            const pkgByCode: { [code: string]: any } = {};

            listPkgs.forEach(p => {
                pkgByName[p.name.trim().toUpperCase()] = p;
                if (p.code_name) pkgByCode[p.code_name.trim().toUpperCase()] = p;
            });

            masterPackages.forEach(mp => {
                const mpName = mp.name.trim().toUpperCase();
                let matchedPkg = pkgByName[mpName];

                if (!matchedPkg && mp.code_name) {
                    matchedPkg = pkgByCode[mp.code_name.trim().toUpperCase()];
                }

                if (!matchedPkg) {
                    const aliases = aliasMap[mp.id] || [];
                    for (const alias of aliases) {
                        if (pkgByName[alias]) {
                            matchedPkg = pkgByName[alias];
                            break;
                        }
                    }
                }

                if (matchedPkg && matchedPkg.b2b_price > 0) {
                    prices.push({
                        test_id: mp.id,
                        lab_id: lab.id,
                        price: matchedPkg.b2b_price,
                        mrp: matchedPkg.mrp
                    });
                }
            });
        });

        res.json({
            tests: masterPackages,
            labs,
            prices
        });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

router.post('/comparison/tests', isAdmin, (req, res) => {
    const { name, prices } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ message: "Test name is required" });

    try {
        const transaction = db.transaction(() => {
            const insertTest = db.prepare('INSERT INTO comparison_tests (name) VALUES (?)');
            const testResult = insertTest.run(name);
            const newTestId = testResult.lastInsertRowid;

            if (prices && Array.isArray(prices)) {
                const insertPrice = db.prepare('INSERT INTO comparison_prices (test_id, lab_id, price) VALUES (?, ?, ?)');
                for (const p of prices) {
                    if (p.lab_id && typeof p.price === 'number') {
                        insertPrice.run(newTestId, p.lab_id, p.price);
                    }
                }
            }
            return newTestId;
        });

        const newId = transaction();
        res.status(201).json({ id: newId, message: 'Test created successfully' });
    } catch (e: any) {
        res.status(e.message.includes("UNIQUE constraint failed") ? 409 : 500).json({ message: e.message.includes("UNIQUE") ? "Test already exists" : e.message });
    }
});

router.put('/comparison/tests/:id', isAdmin, (req, res) => {
    const testId = req.params.id;
    const { name, prices } = req.body;
    
    if (!name || typeof name !== 'string') return res.status(400).json({ message: "Test name is required" });

    try {
        const transaction = db.transaction(() => {
            db.prepare('UPDATE comparison_tests SET name = ? WHERE id = ?').run(name, testId);

            if (prices && Array.isArray(prices)) {
                db.prepare('DELETE FROM comparison_prices WHERE test_id = ?').run(testId);
                const insertPrice = db.prepare('INSERT INTO comparison_prices (test_id, lab_id, price) VALUES (?, ?, ?)');
                for (const p of prices) {
                    if (p.lab_id && typeof p.price === 'number') {
                        insertPrice.run(testId, p.lab_id, p.price);
                    }
                }
            }
        });
        transaction();
        res.json({ message: 'Test updated successfully' });
    } catch (e: any) {
        res.status(e.message.includes("UNIQUE constraint failed") ? 409 : 500).json({ message: e.message.includes("UNIQUE") ? "Test name already exists" : e.message });
    }
});

router.delete('/comparison/tests/:id', isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM comparison_tests WHERE id = ?').run(req.params.id);
        res.status(204).end();
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

router.post('/comparison/labs', isAdmin, (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ message: "Lab name is required" });

    try {
        const result = db.prepare('INSERT INTO comparison_labs (name) VALUES (?)').run(name.trim());
        res.status(201).json({ id: result.lastInsertRowid, message: 'Lab created successfully' });
    } catch (e: any) {
        res.status(e.message.includes("UNIQUE constraint failed") ? 409 : 500).json({ message: e.message.includes("UNIQUE") ? "Lab already exists" : e.message });
    }
});

router.delete('/comparison/labs/:id', isAdmin, (req, res) => {
    try {
        db.prepare('DELETE FROM comparison_labs WHERE id = ?').run(req.params.id);
        res.status(204).end();
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

router.get('/admin/bi-metrics', isAdmin, (req, res) => {
    try {
        // 1. Most used tests
        const mostUsedTests = db.prepare(`
            SELECT package_name as name, COUNT(*) as count 
            FROM receipt_items 
            GROUP BY package_name 
            ORDER BY count DESC 
            LIMIT 10
        `).all();

        // 2. Most used labs
        const mostUsedLabs = db.prepare(`
            SELECT DISTINCT l.name as name, COUNT(DISTINCT r.id) as count
            FROM labs l
            JOIN lab_package_lists lpl ON l.id = lpl.lab_id
            JOIN receipt_items ri ON lpl.package_list_id = ri.package_list_id
            JOIN receipts r ON ri.receipt_id = r.id
            GROUP BY l.name
            ORDER BY count DESC
            LIMIT 10
        `).all();

        res.json({ mostUsedTests, mostUsedLabs });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

router.get('/admin/system-status', isAdmin, (req, res) => {
    try {
        const os = require('os');
        const { execSync } = require('child_process');

        // RAM Metrics
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memPercentage = ((usedMem / totalMem) * 100).toFixed(1);

        // Uptime Metrics
        const uptime = os.uptime(); // in seconds

        // CPU Load
        const load = os.loadavg();

        // Disk Metrics for root partition
        let totalDisk = 0;
        let usedDisk = 0;
        let freeDisk = 0;
        let diskPercentage = '0';
        try {
            const dfOutput = execSync('df -k .').toString().split('\n');
            if (dfOutput.length > 1) {
                const dataLine = dfOutput[1];
                const parts = dataLine.trim().split(/\s+/);
                if (parts.length >= 5) {
                    totalDisk = parseInt(parts[1], 10) * 1024;
                    usedDisk = parseInt(parts[2], 10) * 1024;
                    freeDisk = parseInt(parts[3], 10) * 1024;
                    diskPercentage = parts[4].replace('%', '');
                }
            }
        } catch (diskErr) {
            console.error("Failed to read disk usage", diskErr);
        }

        // Database Metrics
        let dbSize = 0;
        try {
            const dbFilePath = db.name || path.join(__dirname, '..', 'data', 'data.db');
            if (fs.existsSync(dbFilePath)) {
                dbSize = fs.statSync(dbFilePath).size;
            }
        } catch (dbErr) {
            console.error("Failed to read database size", dbErr);
        }

        res.json({
            memory: {
                total: totalMem,
                free: freeMem,
                used: usedMem,
                percentage: parseFloat(memPercentage)
            },
            disk: {
                total: totalDisk,
                used: usedDisk,
                free: freeDisk,
                percentage: parseFloat(diskPercentage)
            },
            db: {
                size: dbSize
            },
            uptime: uptime,
            load: load
        });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

export default router;

