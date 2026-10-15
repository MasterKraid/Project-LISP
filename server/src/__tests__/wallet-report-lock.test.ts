import { createTestDb } from './setup';

describe('Report Viewing Lock Logic (WAL-1)', () => {
    let db: ReturnType<typeof createTestDb>;

    beforeEach(() => {
        db = createTestDb();
        db.prepare(`
            INSERT INTO branches (id, name, address) VALUES (1, 'Main', 'Kolkata')
        `).run();

        // Insert test client with different balances
        db.prepare(`
            INSERT INTO users (id, username, password_hash, branchId, role, wallet_balance, allow_negative_balance)
            VALUES (101, 'client_due', 'hash', 1, 'CLIENT', -5.00, 0)
        `).run();

        db.prepare(`
            INSERT INTO users (id, username, password_hash, branchId, role, wallet_balance, allow_negative_balance)
            VALUES (102, 'client_allowed', 'hash', 1, 'CLIENT', -5.00, 1)
        `).run();

        db.prepare(`
            INSERT INTO users (id, username, password_hash, branchId, role, wallet_balance, allow_negative_balance)
            VALUES (103, 'client_positive', 'hash', 1, 'CLIENT', 10.00, 0)
        `).run();

        db.prepare(`
            INSERT INTO users (id, username, password_hash, branchId, role, wallet_balance, allow_negative_balance)
            VALUES (104, 'client_zero', 'hash', 1, 'CLIENT', 0.00, 0)
        `).run();

        db.prepare(`
            INSERT INTO users (id, username, password_hash, branchId, role, wallet_balance, allow_negative_balance)
            VALUES (105, 'client_borderline', 'hash', 1, 'CLIENT', -0.50, 0)
        `).run();
    });

    afterEach(() => {
        db.close();
    });

    function checkCanViewReport(clientId: number): boolean {
        const client = db.prepare('SELECT wallet_balance, allow_negative_balance, negative_balance_allowed_until FROM users WHERE id = ?').get(clientId) as any;
        if (!client) return false;

        let isNegativeAllowed = false;
        if (client.wallet_balance > -1) {
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
        return isNegativeAllowed;
    }

    test('client with balance <= -1 cannot view reports when negative allowed is false', () => {
        expect(checkCanViewReport(101)).toBe(false);
    });

    test('client with balance <= -1 CAN view reports when negative allowed is true', () => {
        expect(checkCanViewReport(102)).toBe(true);
    });

    test('client with positive balance can view reports', () => {
        expect(checkCanViewReport(103)).toBe(true);
    });

    test('client with exactly 0.00 balance can view reports', () => {
        expect(checkCanViewReport(104)).toBe(true);
    });

    test('client with -0.50 balance (greater than -1) can view reports', () => {
        expect(checkCanViewReport(105)).toBe(true);
    });
});
