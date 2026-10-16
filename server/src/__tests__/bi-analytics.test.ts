import { createTestDb, seedMultiLabScenario, createReceiptWithDeduction } from './setup';

describe('Business Intelligence & Analytics (Module 7)', () => {
    let db: ReturnType<typeof createTestDb>;
    let ids: ReturnType<typeof seedMultiLabScenario>;

    beforeEach(() => {
        db = createTestDb();
        ids = seedMultiLabScenario(db);
    });

    afterEach(() => {
        db.close();
    });

    describe('ANL-1 [Critical] Immutable BI Snapshots', () => {
        test('receipt stores b2b_cost and items store b2b_price at creation time', () => {
            const receiptRes = createReceiptWithDeduction(db, {
                customerId: 1,
                branchId: 1,
                items: [{ name: 'CBC', mrp: 300, discount: 0, package_list_id: ids.listAlphaId }],
                createdByUserId: ids.multiLabClientId,
                actingAsClientId: ids.multiLabClientId
            });

            // Check receipt has b2b_cost snapshot = 150
            const receipt = db.prepare('SELECT b2b_cost, total_mrp, amount_final FROM receipts WHERE id = ?').get(receiptRes.receiptId) as any;
            expect(receipt.b2b_cost).toBe(150);

            // Check receipt item has b2b_price snapshot = 150
            const item = db.prepare('SELECT b2b_price FROM receipt_items WHERE receipt_id = ?').get(receiptRes.receiptId) as any;
            expect(item.b2b_price).toBe(150);
        });

        test('future price changes to package do NOT alter historical saved receipt snapshot or profit', () => {
            const receiptRes = createReceiptWithDeduction(db, {
                customerId: 1,
                branchId: 1,
                items: [{ name: 'CBC', mrp: 300, discount: 0, package_list_id: ids.listAlphaId }],
                createdByUserId: ids.multiLabClientId,
                actingAsClientId: ids.multiLabClientId
            });

            // Now admin changes B2B price of CBC in listAlphaId from 150 to 280
            db.prepare('UPDATE packages SET b2b_price = 280 WHERE package_list_id = ? AND name = ?').run(ids.listAlphaId, 'CBC');

            // Verify historical snapshot is completely unchanged
            const receipt = db.prepare('SELECT b2b_cost FROM receipts WHERE id = ?').get(receiptRes.receiptId) as any;
            expect(receipt.b2b_cost).toBe(150);

            const item = db.prepare('SELECT b2b_price FROM receipt_items WHERE receipt_id = ?').get(receiptRes.receiptId) as any;
            expect(item.b2b_price).toBe(150);

            // BI profit calculation using snapshot remains 300 - 150 = 150, not 300 - 280
            const stats = db.prepare(`
                SELECT 
                    SUM(COALESCE(r.b2b_cost, t.amount_deducted, 0)) as total_spend,
                    SUM(COALESCE(r.amount_received, r.amount_final, 0) - COALESCE(r.b2b_cost, t.amount_deducted, 0)) as total_profit
                FROM receipts r
                LEFT JOIN transactions t ON t.receipt_id = r.id AND t.type = 'RECEIPT_DEDUCTION'
                WHERE r.acting_as_client_id = ?
            `).get(ids.multiLabClientId) as any;

            expect(stats.total_spend).toBe(150);
            expect(stats.total_profit).toBe(150);
        });
    });

    describe('ANL-4 [High] Client Profit Calculation Rework', () => {
        test('profit uses actual amount collected (amount_received), not MRP', () => {
            // Patient owes 300 (MRP), client collected 250 in amount_received, B2B cost is 150
            const customerId = 1;
            const branchId = 1;
            const totalMrp = 300;
            const netPayable = 300;
            const amountReceived = 250;
            const amountDue = 50;
            const b2bCost = 150;

            const res = db.prepare(`
                INSERT INTO receipts (customer_id, branch_id, created_at, total_mrp, amount_final, amount_received, amount_due, payment_method, num_tests, created_by_user_id, acting_as_client_id, b2b_cost)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(customerId, branchId, '16/10/2026 | 12:00:00 | UTC+5:30', totalMrp, netPayable, amountReceived, amountDue, 'Cash', 1, ids.multiLabClientId, ids.multiLabClientId, b2bCost);

            const receiptId = res.lastInsertRowid;
            db.prepare('INSERT INTO receipt_items (receipt_id, package_name, mrp, discount_percentage, package_list_id, b2b_price) VALUES (?, ?, ?, ?, ?, ?)')
                .run(receiptId, 'CBC', 300, 0, ids.listAlphaId, b2bCost);

            // Deduct transaction
            db.prepare('INSERT INTO transactions (user_id, date, type, amount_deducted, balance_snapshot, receipt_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(ids.multiLabClientId, '16/10/2026 | 12:00:00 | UTC+5:30', 'RECEIPT_DEDUCTION', b2bCost, 850, receiptId, 'Receipt deduction');

            // Calculate profit: should be amount_received (250) - b2bCost (150) = 100 (NOT 300 - 150 = 150)
            const stats = db.prepare(`
                SELECT 
                    SUM(COALESCE(r.b2b_cost, t.amount_deducted, 0)) as total_spend,
                    SUM(COALESCE(r.amount_received, r.amount_final, 0) - COALESCE(r.b2b_cost, t.amount_deducted, 0)) as total_profit
                FROM receipts r
                LEFT JOIN transactions t ON t.receipt_id = r.id AND t.type = 'RECEIPT_DEDUCTION'
                WHERE r.acting_as_client_id = ?
            `).get(ids.multiLabClientId) as any;

            expect(stats.total_spend).toBe(150);
            expect(stats.total_profit).toBe(100); // 250 - 150 = 100!
        });
    });
});
