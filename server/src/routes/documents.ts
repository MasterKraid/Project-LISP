import { Router } from 'express';
import { db } from '../database';
import { User, Receipt, Estimate, Customer, Branch, PackageList, Package, Transaction, Lab } from '../types';
import { isAuthenticated, isAdmin, getISTDateTimeString } from './shared';

const router = Router();

const handleCustomerData = (customer_data: any, user_id: number): number => {
    // SCENARIO 1: An existing customer was selected from the search.
    // We have an ID and should ONLY update this customer with new fields (do not overwrite with empty values).
    if (customer_data.id) {
        const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_data.id) as any;
        if (existing) {
            const merged = {
                prefix: customer_data.prefix !== undefined && customer_data.prefix !== '' ? customer_data.prefix : existing.prefix,
                name: customer_data.name !== undefined && customer_data.name !== '' ? customer_data.name.trim().toUpperCase() : existing.name,
                mobile: customer_data.mobile !== undefined && customer_data.mobile !== '' ? customer_data.mobile : existing.mobile,
                email: customer_data.email !== undefined && customer_data.email !== '' ? customer_data.email : existing.email,
                dob: customer_data.dob !== undefined && customer_data.dob !== '' ? customer_data.dob : existing.dob,
                age: customer_data.age !== undefined && customer_data.age !== '' ? customer_data.age : existing.age,
                age_years: customer_data.age_years !== undefined && customer_data.age_years !== '' ? customer_data.age_years : existing.age_years,
                age_months: customer_data.age_months !== undefined && customer_data.age_months !== '' ? customer_data.age_months : existing.age_months,
                age_days: customer_data.age_days !== undefined && customer_data.age_days !== '' ? customer_data.age_days : existing.age_days,
                gender: customer_data.gender !== undefined && customer_data.gender !== '' ? customer_data.gender : existing.gender,
            };
            db.prepare(`UPDATE customers SET prefix = ?, name = ?, mobile = ?, email = ?, dob = ?, age = ?, age_years = ?, age_months = ?, age_days = ?, gender = ?, updated_at = ? WHERE id = ?`)
                .run(
                    merged.prefix, 
                    merged.name, 
                    merged.mobile, 
                    merged.email, 
                    merged.dob, 
                    merged.age ? parseInt(merged.age, 10) : null, 
                    merged.age_years !== '' && merged.age_years !== null && merged.age_years !== undefined ? parseInt(merged.age_years, 10) : null,
                    merged.age_months !== '' && merged.age_months !== null && merged.age_months !== undefined ? parseInt(merged.age_months, 10) : null,
                    merged.age_days !== '' && merged.age_days !== null && merged.age_days !== undefined ? parseInt(merged.age_days, 10) : null,
                    merged.gender, 
                    getISTDateTimeString(), 
                    customer_data.id
                );
        }
        return customer_data.id;
    }

    // SCENARIO 3: The mobile number is unique, so we can safely create a new customer.
    const now = getISTDateTimeString();
    const result = db.prepare(`INSERT INTO customers (prefix, name, mobile, email, dob, age, age_years, age_months, age_days, gender, created_at, updated_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
            customer_data.prefix, 
            customer_data.name ? customer_data.name.trim().toUpperCase() : '', 
            customer_data.mobile, 
            customer_data.email, 
            customer_data.dob, 
            customer_data.age ? parseInt(customer_data.age, 10) : null, 
            customer_data.age_years !== '' && customer_data.age_years !== undefined ? parseInt(customer_data.age_years, 10) : null,
            customer_data.age_months !== '' && customer_data.age_months !== undefined ? parseInt(customer_data.age_months, 10) : null,
            customer_data.age_days !== '' && customer_data.age_days !== undefined ? parseInt(customer_data.age_days, 10) : null,
            customer_data.gender, 
            now, 
            now, 
            user_id
        );
    return result.lastInsertRowid as number;
};

router.post('/receipts', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    const { payload, context } = req.body;
    const { branch, acting_as_client_id } = context || {};

    try {
        const transaction = db.transaction(() => {
            const customerId = handleCustomerData(payload.customer_data, acting_as_client_id || user.id);

            const lab = db.prepare('SELECT logo_path FROM labs JOIN lab_package_lists lpl ON labs.id = lpl.lab_id WHERE lpl.package_list_id = ? LIMIT 1').get(payload.items[0].package_list_id) as Lab | undefined;

            const receiptResult = db.prepare(`INSERT INTO receipts (customer_id, branch_id, created_at, total_mrp, amount_final, amount_received, amount_due, payment_method, referred_by, notes, num_tests, logo_path, created_by_user_id, acting_as_client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(customerId, branch.id, getISTDateTimeString(), payload.total_mrp, payload.amount_final, payload.amount_received, payload.amount_due, payload.payment_method, payload.referred_by, payload.notes, payload.num_tests || payload.items.length, lab?.logo_path, user.id, acting_as_client_id || null);

            const receiptId = receiptResult.lastInsertRowid;

            const insertItem = db.prepare('INSERT INTO receipt_items (receipt_id, package_name, mrp, discount_percentage, package_list_id) VALUES (?, ?, ?, ?, ?)');
            payload.items.forEach((item: any) => insertItem.run(receiptId, item.name, item.mrp, item.discount, item.package_list_id || null));

            let targetClientId = -1;
            if (user.role === 'CLIENT') {
                targetClientId = user.id;
            } else if (acting_as_client_id && (user.role === 'ADMIN' || user.role === 'DATA_ENTRY' || user.master_data_entry)) {
                targetClientId = acting_as_client_id;
            }

            let updatedUser: User | null = null;
            if (targetClientId !== -1) {
                // Fetch the client's custom package list IDs
                const clientAccess = db.prepare('SELECT package_list_id FROM user_package_list_access WHERE user_id = ?').all(targetClientId) as { package_list_id: number }[];
                const listIds = clientAccess.map(row => row.package_list_id);

                const totalB2BCost = payload.items.reduce((sum: number, item: any) => {
                    const itemPkgListId = Number(item.package_list_id || payload.package_list_id);
                    if (!itemPkgListId || !listIds.includes(itemPkgListId)) {
                        throw new Error(`Unauthorized or missing rate category for item: ${item.name}`);
                    }
                    let actualB2B = 0;
                    const pkg = db.prepare(`SELECT b2b_price FROM packages WHERE package_list_id = ? AND name = ?`).get(itemPkgListId, item.name) as Package | undefined;
                    if (pkg) {
                        actualB2B = pkg.b2b_price;
                    } else {
                        throw new Error(`Test '${item.name}' is not available in the selected laboratory/rate database.`);
                    }
                    return sum + actualB2B;
                }, 0);

                const client = db.prepare('SELECT wallet_balance, allow_negative_balance, negative_balance_allowed_until FROM users WHERE id = ?').get(targetClientId) as User;
                if (!client) throw new Error("Target B2B Client not found");

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
                    throw new Error(`Insufficient wallet balance for B2B transaction (Required: ₹${totalB2BCost.toFixed(2)}, Available: ₹${client.wallet_balance.toFixed(2)})`);
                }

                db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(totalB2BCost, targetClientId);

                const newBalanceObj = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(targetClientId) as { wallet_balance: number };

                db.prepare('INSERT INTO transactions (user_id, date, type, amount_deducted, balance_snapshot, receipt_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    .run(targetClientId, getISTDateTimeString(), 'RECEIPT_DEDUCTION', totalB2BCost, newBalanceObj.wallet_balance, receiptId, `Receipt deduction for RCPT-${String(receiptId).padStart(6, '0')}`);

                if (targetClientId === user.id) {
                    updatedUser = { ...user, wallet_balance: newBalanceObj.wallet_balance };
                    (req.session as any).user = updatedUser;
                }
            }

            const newReceipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(receiptId) as Receipt;
            return { newReceipt, updatedUser };
        });

        res.status(201).json(transaction());
    } catch (e: any) {
        res.status(500).json({ message: `Receipt creation failed: ${e.message}` });
    }
});

router.put('/receipts/:id', isAuthenticated, isAdmin, (req, res) => {
    const user = (req.session as any).user as User;
    const { payload } = req.body;
    const receiptId = parseInt(req.params.id, 10);

    if (isNaN(receiptId)) {
        return res.status(400).json({ message: "Invalid receipt ID." });
    }

    try {
        const result = db.transaction(() => {
            const existingReceipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(receiptId) as Receipt;
            if (!existingReceipt) throw new Error("Receipt not found.");

            if (existingReceipt.data_entry_done === 1) {
                throw new Error("Cannot edit a receipt that has already been marked as completed by data entry.");
            }

            // 1. Determine old B2B client and old B2B cost from existing transaction
            const oldTx = db.prepare('SELECT * FROM transactions WHERE receipt_id = ? AND type = ?').get(receiptId, 'RECEIPT_DEDUCTION') as Transaction | undefined;
            const oldB2BCost = oldTx ? oldTx.amount_deducted : 0;
            const oldClientId = oldTx ? oldTx.user_id : -1;

            // 3. Determine new B2B target client
            let newTargetClientId = -1;
            if (existingReceipt.acting_as_client_id) {
                newTargetClientId = existingReceipt.acting_as_client_id;
            } else {
                const creator = db.prepare('SELECT role FROM users WHERE id = ?').get(existingReceipt.created_by_user_id) as { role: string } | undefined;
                if (creator && creator.role === 'CLIENT') {
                    newTargetClientId = existingReceipt.created_by_user_id;
                }
            }

            // 2. Update customer data
            const customerId = handleCustomerData(payload.customer_data, newTargetClientId !== -1 ? newTargetClientId : user.id);

            // 4. Calculate new B2B cost from the submitted items with database verification
            let newB2BCost = 0;
            if (newTargetClientId !== -1) {
                const clientAccess = db.prepare('SELECT package_list_id FROM user_package_list_access WHERE user_id = ?').all(newTargetClientId) as { package_list_id: number }[];
                const listIds = clientAccess.map(row => row.package_list_id);

                newB2BCost = (payload.items || []).reduce((sum: number, item: any) => {
                    const itemPkgListId = Number(item.package_list_id || payload.package_list_id);
                    if (!itemPkgListId || !listIds.includes(itemPkgListId)) {
                        throw new Error(`Unauthorized or missing rate category for item: ${item.name}`);
                    }
                    let actualB2B = 0;
                    const pkg = db.prepare(`SELECT b2b_price FROM packages WHERE package_list_id = ? AND name = ?`).get(itemPkgListId, item.name) as Package | undefined;
                    if (pkg) {
                        actualB2B = pkg.b2b_price;
                    } else {
                        throw new Error(`Test '${item.name}' is not available in the selected laboratory/rate database.`);
                    }
                    return sum + actualB2B;
                }, 0);
            }

            // 5. Handle wallet adjustments
            if (oldClientId !== -1 && newTargetClientId !== -1 && oldClientId === newTargetClientId) {
                // Same client: apply delta
                const balanceDiff = oldB2BCost - newB2BCost;
                db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(balanceDiff, newTargetClientId);

                const newBalanceObj = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(newTargetClientId) as { wallet_balance: number };

                if (oldTx) {
                    db.prepare('UPDATE transactions SET amount_deducted = ?, balance_snapshot = ?, date = ?, notes = ? WHERE id = ?')
                        .run(newB2BCost, newBalanceObj.wallet_balance, getISTDateTimeString(), `Edited receipt RCPT-${String(receiptId).padStart(6, '0')}`, oldTx.id);
                }
            } else {
                // Client changed or one side was walk-in
                if (oldClientId !== -1 && oldTx) {
                    // Refund old client
                    db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(oldB2BCost, oldClientId);
                    db.prepare('DELETE FROM transactions WHERE id = ?').run(oldTx.id);
                }

                if (newTargetClientId !== -1 && newB2BCost > 0) {
                    // Deduct new client
                    const client = db.prepare('SELECT wallet_balance, allow_negative_balance, negative_balance_allowed_until FROM users WHERE id = ?').get(newTargetClientId) as User;
                    if (!client) throw new Error("Target B2B Client not found.");

                    let canProceed = false;
                    if (client.wallet_balance >= newB2BCost) {
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
                        throw new Error(`Insufficient wallet balance for B2B transaction (Required: ₹${newB2BCost.toFixed(2)}, Available: ₹${client.wallet_balance.toFixed(2)})`);
                    }

                    db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(newB2BCost, newTargetClientId);
                    const newBalanceObj = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(newTargetClientId) as { wallet_balance: number };

                    db.prepare('INSERT INTO transactions (user_id, date, type, amount_deducted, balance_snapshot, receipt_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
                        .run(newTargetClientId, getISTDateTimeString(), 'RECEIPT_DEDUCTION', newB2BCost, newBalanceObj.wallet_balance, receiptId, `Edited receipt RCPT-${String(receiptId).padStart(6, '0')}`);
                }
            }

            // 6. Replace receipt items
            db.prepare('DELETE FROM receipt_items WHERE receipt_id = ?').run(receiptId);
            const insertItem = db.prepare('INSERT INTO receipt_items (receipt_id, package_name, mrp, discount_percentage, package_list_id) VALUES (?, ?, ?, ?, ?)');
            (payload.items || []).forEach((item: any) => insertItem.run(receiptId, item.name, item.mrp, isNaN(item.discount) ? 0 : item.discount, item.package_list_id || null));

            // 7. Resolve lab logo
            const lab = (payload.items && payload.items.length > 0 && payload.items[0].package_list_id)
                ? db.prepare('SELECT logo_path FROM labs JOIN lab_package_lists lpl ON labs.id = lpl.lab_id WHERE lpl.package_list_id = ? LIMIT 1').get(payload.items[0].package_list_id) as Lab | undefined
                : undefined;

            // 8. Update receipt metadata
            db.prepare(`UPDATE receipts SET customer_id = ?, total_mrp = ?, amount_final = ?, amount_received = ?, amount_due = ?, payment_method = ?, referred_by = ?, notes = ?, num_tests = ?, logo_path = ?, acting_as_client_id = ? WHERE id = ?`)
                .run(customerId, payload.total_mrp, payload.amount_final, payload.amount_received, payload.amount_due, payload.payment_method, payload.referred_by, payload.notes, payload.num_tests || (payload.items || []).length, lab?.logo_path || existingReceipt.logo_path, newTargetClientId !== -1 ? newTargetClientId : null, receiptId);

            return db.prepare('SELECT * FROM receipts WHERE id = ?').get(receiptId) as Receipt;
        })();

        res.json(result);
    } catch (e: any) {
        res.status(500).json({ message: `Receipt update failed: ${e.message}` });
    }
});

router.post('/estimates', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    const { payload, context } = req.body;
    const { branch, acting_as_client_id } = context || {};

    try {
        const transaction = db.transaction(() => {
            const customerId = handleCustomerData(payload.customer_data, acting_as_client_id || user.id);

            const estimateResult = db.prepare(`INSERT INTO estimates (customer_id, branch_id, created_at, amount_after_discount, referred_by, notes, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .run(customerId, branch.id, getISTDateTimeString(), payload.amount_after_discount, payload.referred_by, payload.notes, user.id);

            const newEstimateId = estimateResult.lastInsertRowid;

            const insertItem = db.prepare('INSERT INTO estimate_items (estimate_id, package_name, mrp, discount_percentage) VALUES (?, ?, ?, ?)');
            payload.items.forEach((item: any) => insertItem.run(newEstimateId, item.name, item.mrp, item.discount));

            return db.prepare('SELECT * FROM estimates WHERE id = ?').get(newEstimateId) as Estimate;
        });
        res.status(201).json(transaction());
    } catch (e: any) { res.status(500).json({ message: `Estimate creation failed: ${e.message}` }); }
});

router.get('/receipts/:id', isAuthenticated, (req, res) => {
    try {
        const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(req.params.id) as Receipt;
        if (!receipt) return res.status(404).json({ message: "Receipt not found" });

        const user = (req.session as any).user as User;
        if (user.role === 'CLIENT') {
            if (receipt.created_by_user_id !== user.id && receipt.acting_as_client_id !== user.id) {
                return res.status(403).json({ message: "Forbidden: You do not have permission to view this receipt." });
            }
        } else if (user.role === 'GENERAL_EMPLOYEE') {
            if (receipt.branch_id !== user.branchId) {
                return res.status(403).json({ message: "Forbidden: You do not have permission to view receipts from other branches." });
            }
        }

        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(receipt.customer_id) as Customer;
        const items = db.prepare('SELECT id, package_name, mrp, discount_percentage, package_list_id FROM receipt_items WHERE receipt_id = ?').all(req.params.id) as any[];
        
        let targetClientId = -1;
        if (receipt.acting_as_client_id) {
            targetClientId = receipt.acting_as_client_id;
        } else {
            const creator = db.prepare('SELECT role FROM users WHERE id = ?').get(receipt.created_by_user_id) as { role: string } | undefined;
            if (creator && creator.role === 'CLIENT') {
                targetClientId = receipt.created_by_user_id;
            }
        }

        let enrichedItems = items;
        if (targetClientId !== -1) {
            const clientAccess = db.prepare('SELECT package_list_id FROM user_package_list_access WHERE user_id = ?').all(targetClientId) as { package_list_id: number }[];
            const listIds = clientAccess.map(row => row.package_list_id);
            if (listIds.length > 0) {
                enrichedItems = items.map(item => {
                    const itemPkgListId = item.package_list_id;
                    let b2b_price = 0;
                    if (itemPkgListId && listIds.includes(itemPkgListId)) {
                        const pkg = db.prepare(`SELECT b2b_price FROM packages WHERE package_list_id = ? AND name = ?`).get(itemPkgListId, item.package_name) as Package | undefined;
                        if (pkg) b2b_price = pkg.b2b_price;
                    } else if (!itemPkgListId && listIds.length > 0) {
                        // Fallback for legacy/historic receipts where package_list_id is null
                        const pkg = db.prepare(`SELECT b2b_price FROM packages WHERE package_list_id IN (${listIds.join(',')}) AND name = ?`).get(item.package_name) as Package | undefined;
                        if (pkg) b2b_price = pkg.b2b_price;
                    }
                    return {
                        ...item,
                        b2b_price
                    };
                });
            }
        }

        const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(receipt.branch_id) as Branch;
        res.json({ receipt, customer, items: enrichedItems, branch });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/estimates/:id', isAuthenticated, (req, res) => {
    try {
        const estimate = db.prepare('SELECT * FROM estimates WHERE id = ?').get(req.params.id) as Estimate;
        if (!estimate) return res.status(404).json({ message: "Estimate not found" });

        const user = (req.session as any).user as User;
        if (user.role === 'CLIENT') {
            if (estimate.created_by_user_id !== user.id) {
                return res.status(403).json({ message: "Forbidden: You do not have permission to view this estimate." });
            }
        } else if (user.role === 'GENERAL_EMPLOYEE') {
            if (estimate.branch_id !== user.branchId) {
                return res.status(403).json({ message: "Forbidden: You do not have permission to view estimates from other branches." });
            }
        }

        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(estimate.customer_id) as Customer;
        const items = db.prepare('SELECT id, package_name, mrp, discount_percentage FROM estimate_items WHERE estimate_id = ?').all(req.params.id);
        const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(estimate.branch_id) as Branch;
        res.json({ estimate, customer, items, branch });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/customers/search', isAuthenticated, (req, res) => {
    const q = req.query.q as string;
    try {
        const searchTerm = `%${q}%`;
        const idSearch = `CUST-${'0'.repeat(10 - q.length)}${q}`;
        res.json(db.prepare(`SELECT * FROM customers WHERE is_deleted = 0 AND (name LIKE ? OR mobile LIKE ? OR 'CUST-' || printf('%010d', id) LIKE ?) LIMIT 10`).all(searchTerm, searchTerm, idSearch));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/package-lists/for-lab/:labId', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    const actingAsId = req.headers['x-acting-as-client-id'];
    const effectiveUserId = (actingAsId && (user.role === 'ADMIN' || user.master_data_entry)) ? parseInt(actingAsId as string) : user.id;
    const isActuallyActingAs = !!(actingAsId && (user.role === 'ADMIN' || user.master_data_entry));

    try {
        const query = (user.role === 'ADMIN' && !isActuallyActingAs)
            ? `SELECT pl.* FROM package_lists pl JOIN lab_package_lists lpl ON pl.id = lpl.package_list_id WHERE lpl.lab_id = ?`
            : `SELECT pl.* FROM package_lists pl JOIN lab_package_lists lpl ON pl.id = lpl.package_list_id JOIN user_package_list_access ula ON pl.id = ula.package_list_id WHERE lpl.lab_id = ? AND ula.user_id = ?`;
        const params = (user.role === 'ADMIN' && !isActuallyActingAs) ? [req.params.labId] : [req.params.labId, effectiveUserId];
        res.json(db.prepare(query).all(params));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/packages/for-list/:listId', isAuthenticated, (req, res) => {
    try {
        res.json(db.prepare('SELECT * FROM packages WHERE package_list_id = ? ORDER BY name ASC').all(req.params.listId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/transactions', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    if (user.role !== 'CLIENT') return res.status(403).json({ message: "Forbidden" });
    try {
        const txs = db.prepare(`SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC`).all(user.id) as Transaction[];
        const enrichedTxs = txs.map(tx => {
            if (tx.type === 'RECEIPT_DEDUCTION' && tx.receipt_id) {
                const receipt = db.prepare(`SELECT r.customer_id, c.name as customer_name FROM receipts r JOIN customers c ON c.id = r.customer_id WHERE r.id = ?`).get(tx.receipt_id) as any;
                const clientAccess = db.prepare('SELECT package_list_id FROM user_package_list_access WHERE user_id = ?').all(user.id) as { package_list_id: number }[];
                const listIds = clientAccess.map(row => row.package_list_id);
                const items = db.prepare(`SELECT package_name, mrp, package_list_id FROM receipt_items WHERE receipt_id = ?`).all(tx.receipt_id) as any[];
                let total_profit = 0;
                const itemsWithB2B = items.map(item => {
                    let b2b_price = item.mrp;
                    const itemPkgListId = item.package_list_id;
                    if (itemPkgListId && listIds.includes(itemPkgListId)) {
                        const pkg = db.prepare(`SELECT b2b_price FROM packages WHERE package_list_id = ? AND name = ?`).get(itemPkgListId, item.package_name) as Package | undefined;
                        if (pkg) b2b_price = pkg.b2b_price;
                    } else if (!itemPkgListId && listIds.length > 0) {
                        // Fallback for legacy/historic receipts where package_list_id is null
                        const pkg = db.prepare(`SELECT b2b_price FROM packages WHERE package_list_id IN (${listIds.join(',')}) AND name = ?`).get(item.package_name) as Package | undefined;
                        if (pkg) b2b_price = pkg.b2b_price;
                    }
                    total_profit += item.mrp - b2b_price;
                    return { name: item.package_name, mrp: item.mrp, b2b_price };
                });
                return { ...tx, items: itemsWithB2B, customer_name: receipt?.customer_name, total_profit };
            }
            return tx;
        });
        res.json(enrichedTxs);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/data-entry/receipts', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    if (user.role !== 'ADMIN' && user.role !== 'DATA_ENTRY') {
        return res.status(403).json({ message: "Forbidden: Data Entry Portal access required." });
    }
    try {
        const dateFilter = req.query.date as string; // Expects "DD/MM/YYYY" or "YYYY-MM-DD"
        
        let query = `
            SELECT r.id, r.customer_id, r.branch_id, r.created_at, r.referred_by, r.notes, r.num_tests, r.total_mrp, r.created_by_user_id, r.acting_as_client_id, r.data_entry_done,
                   c.prefix, c.name as customer_name, c.mobile, c.email, c.dob, c.age_years, c.age_months, c.age_days, c.gender,
                   u.alias as user_alias, u.username as username,
                   cl.alias as client_alias, cl.username as client_username
            FROM receipts r
            JOIN customers c ON c.id = r.customer_id
            JOIN users u ON u.id = r.created_by_user_id
            LEFT JOIN users cl ON r.acting_as_client_id = cl.id
        `;
        const params: any[] = [];
        if (dateFilter) {
            query += ` WHERE r.created_at LIKE ?`;
            params.push(`${dateFilter}%`);
        }
        query += ` ORDER BY r.id DESC`;
        
        const receipts = db.prepare(query).all(params) as any[];
        
        // Enrich with items (only names, no pricing) and resolve lab details
        const enriched = receipts.map(r => {
            const items = db.prepare(`
                SELECT ri.package_name, MAX(p.code_name) as code_name
                FROM receipt_items ri
                LEFT JOIN packages p ON ri.package_name = p.name AND (
                    ri.package_list_id = p.package_list_id OR 
                    (ri.package_list_id IS NULL AND p.package_list_id IN (
                        SELECT lpl.package_list_id 
                        FROM lab_package_lists lpl
                        JOIN user_package_list_access upla ON lpl.package_list_id = upla.package_list_id
                        WHERE upla.user_id = COALESCE(?, ?)
                    ))
                )
                WHERE ri.receipt_id = ?
                GROUP BY ri.package_name
            `).all(r.acting_as_client_id, r.created_by_user_id, r.id) as any[];
            const display_doc_id = `RCPT-${String(r.id).padStart(6, '0')}`;
            const display_date = r.created_at;
            const display_customer_id = `CUST-${String(r.customer_id).padStart(6, '0')}`;

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

            let creator = r.user_alias || r.username;
            if (r.acting_as_client_id) {
                const clientName = r.client_alias || r.client_username;
                creator = `${clientName} [M.ENTRY BY - ${creator}]`;
            }

            return {
                ...r,
                display_doc_id,
                display_date,
                display_customer_id,
                items,
                lab_id: labInfo?.lab_id || null,
                lab_name: labInfo?.lab_name || 'N/A',
                created_by_user: creator
            };
        });
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put('/receipts/:id/data-entry', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    if (user.role !== 'ADMIN' && user.role !== 'DATA_ENTRY') {
        return res.status(403).json({ message: "Forbidden: Data Entry Portal access required." });
    }
    const receiptId = parseInt(req.params.id, 10);
    const { isDone } = req.body;
    
    if (isNaN(receiptId)) {
        return res.status(400).json({ message: "Invalid receipt ID." });
    }
    
    try {
        const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(receiptId) as Receipt;
        if (!receipt) {
            return res.status(404).json({ message: "Receipt not found." });
        }
        
        // Reverting (isDone = false) can only be done by Admin
        if (!isDone && user.role !== 'ADMIN') {
            return res.status(403).json({ message: "Only administrators can mark a completed receipt as incomplete." });
        }
        
        db.prepare('UPDATE receipts SET data_entry_done = ? WHERE id = ?').run(isDone ? 1 : 0, receiptId);
        res.status(204).end();
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/client/analysis', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    if (user.role !== 'CLIENT') {
        return res.status(403).json({ message: "Forbidden: B2B Client role required." });
    }
    try {
        const clientId = user.id;

        const userObj = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(clientId) as { wallet_balance: number };

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthStr = `${currentYear}-${currentMonth}`;

        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthYear = lastMonthDate.getFullYear();
        const lastMonthVal = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
        const lastMonthStr = `${lastMonthYear}-${lastMonthVal}`;

        // 1. Spends, Count, Savings and Franchisee Profit
        const stats = db.prepare(`
            SELECT 
                COUNT(r.id) as total_orders,
                SUM(COALESCE(t.amount_deducted, 0)) as total_spend,
                SUM(r.total_mrp - COALESCE(t.amount_deducted, 0)) as total_savings,
                SUM(r.amount_final - COALESCE(t.amount_deducted, 0)) as total_profit
            FROM receipts r
            LEFT JOIN transactions t ON t.receipt_id = r.id AND t.type = 'RECEIPT_DEDUCTION'
            WHERE r.acting_as_client_id = ? OR (r.acting_as_client_id IS NULL AND r.created_by_user_id = ?)
        `).get(clientId, clientId) as { total_orders: number; total_spend: number; total_savings: number; total_profit: number };

        // 1b. Current Month and Last Month stats
        const monthlyStats = db.prepare(`
            SELECT 
                SUM(CASE WHEN (substr(r.created_at, 7, 4) || '-' || substr(r.created_at, 4, 2)) = ? THEN r.total_mrp ELSE 0 END) as current_month_mrp,
                SUM(CASE WHEN (substr(r.created_at, 7, 4) || '-' || substr(r.created_at, 4, 2)) = ? THEN COALESCE(t.amount_deducted, 0) ELSE 0 END) as current_month_b2b,
                SUM(CASE WHEN (substr(r.created_at, 7, 4) || '-' || substr(r.created_at, 4, 2)) = ? THEN 1 ELSE 0 END) as current_month_patients,
                SUM(CASE WHEN (substr(r.created_at, 7, 4) || '-' || substr(r.created_at, 4, 2)) = ? THEN COALESCE(t.amount_deducted, 0) ELSE 0 END) as last_month_b2b
            FROM receipts r
            LEFT JOIN transactions t ON t.receipt_id = r.id AND t.type = 'RECEIPT_DEDUCTION'
            WHERE r.acting_as_client_id = ? OR (r.acting_as_client_id IS NULL AND r.created_by_user_id = ?)
        `).get(currentMonthStr, currentMonthStr, currentMonthStr, lastMonthStr, clientId, clientId) as {
            current_month_mrp: number;
            current_month_b2b: number;
            current_month_patients: number;
            last_month_b2b: number;
        };

        // 2. Volume Trend (Last 6 Months)
        const trend = db.prepare(`
            SELECT 
                (substr(r.created_at, 7, 4) || '-' || substr(r.created_at, 4, 2)) as month,
                COUNT(r.id) as count,
                SUM(COALESCE(t.amount_deducted, 0)) as spend
            FROM receipts r
            LEFT JOIN transactions t ON t.receipt_id = r.id AND t.type = 'RECEIPT_DEDUCTION'
            WHERE r.acting_as_client_id = ? OR (r.acting_as_client_id IS NULL AND r.created_by_user_id = ?)
            GROUP BY month
            ORDER BY month DESC
        `).all(clientId, clientId) as any[];

        // 3. Top 5 Ordered Tests
        const topTests = db.prepare(`
            SELECT 
                package_name,
                COUNT(*) as count
            FROM receipt_items
            WHERE receipt_id IN (
                SELECT id FROM receipts 
                WHERE acting_as_client_id = ? OR (acting_as_client_id IS NULL AND created_by_user_id = ?)
            )
            GROUP BY package_name
            ORDER BY count DESC
            LIMIT 5
        `).all(clientId, clientId) as any[];

        res.json({
            stats: {
                total_orders: stats.total_orders || 0,
                total_spend: stats.total_spend || 0,
                total_savings: stats.total_savings || 0,
                total_profit: stats.total_profit || 0,
                wallet_balance: userObj?.wallet_balance || 0,
                current_month_mrp: monthlyStats.current_month_mrp || 0,
                current_month_b2b: monthlyStats.current_month_b2b || 0,
                current_month_patients: monthlyStats.current_month_patients || 0,
                last_month_b2b: monthlyStats.last_month_b2b || 0
            },
            trend: trend.reverse(), // Chronological order
            topTests
        });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/reports/pending-alarm', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    if (user.role !== 'ADMIN' && user.role !== 'GENERAL_EMPLOYEE' && user.role !== 'DATA_ENTRY') {
        return res.status(403).json({ message: "Forbidden" });
    }
    try {
        // Find all receipts where customer doesn't have an uploaded lab report and alarm is not dismissed
        const pendingReceipts = db.prepare(`
            SELECT r.id, r.created_at, c.name as customer_name, c.id as customer_id
            FROM receipts r
            JOIN customers c ON c.id = r.customer_id
            WHERE r.alarm_done = 0
              AND r.customer_id NOT IN (SELECT customer_id FROM lab_reports WHERE customer_id IS NOT NULL)
        `).all() as any[];

        let warningCount = 0; // Day 2 (24h - 48h)
        let alarmCount = 0;   // Day 3+ (> 48h)
        const criticalList: any[] = [];

        // Parse now
        const now = new Date();

        pendingReceipts.forEach(r => {
            try {
                const datePart = r.created_at.split(' | ')[0]; // "DD/MM/YYYY"
                const [d, m, y] = datePart.split('/').map(Number);
                const createdDate = new Date(y, m - 1, d);
                
                const msDiff = now.getTime() - createdDate.getTime();
                const daysDiff = Math.floor(msDiff / (1000 * 3600 * 24));

                if (daysDiff === 1) {
                    warningCount++;
                } else if (daysDiff >= 2) {
                    alarmCount++;
                    criticalList.push({
                        id: r.id,
                        customer_name: r.customer_name,
                        display_doc_id: `RCPT-${String(r.id).padStart(6, '0')}`,
                        days_pending: daysDiff + 1,
                        created_at: r.created_at
                    });
                }
            } catch (err) {
                // Ignore parse errors for corrupt dates
            }
        });

        res.json({
            warningCount,
            alarmCount,
            criticalList: criticalList.slice(0, 5) // Return top 5 longest pending
        });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post('/reports/dismiss-alarm/:id', isAuthenticated, (req, res) => {
    const user = (req.session as any).user as User;
    if (user.role !== 'ADMIN' && user.role !== 'GENERAL_EMPLOYEE' && user.role !== 'DATA_ENTRY') {
        return res.status(403).json({ message: "Forbidden" });
    }
    const receiptId = parseInt(req.params.id);
    try {
        db.prepare('UPDATE receipts SET alarm_done = 1 WHERE id = ?').run(receiptId);
        res.json({ success: true, message: "Alarm marked as done." });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

export default router;
