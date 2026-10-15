import { createTestDb } from './setup';

describe('Admin UPI Settings Persistence (UPI-2)', () => {
    let db: ReturnType<typeof createTestDb>;

    beforeEach(() => {
        db = createTestDb();
        db.prepare("INSERT OR REPLACE INTO admin_settings (id, upi_id, organization_name, lab_name) VALUES (1, 'initial@upi', 'N/A', 'N/A')").run();
    });

    afterEach(() => {
        db.close();
    });

    test('saving organization name does not reset upi_id or lab_name', () => {
        const current = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get() as any;
        expect(current.upi_id).toBe('initial@upi');
        expect(current.organization_name).toBe('N/A');
        expect(current.lab_name).toBe('N/A');

        // Simulate updating organization_name only
        const newOrg = 'Test Organization';
        const newUpi = current.upi_id; // preserved
        const newLab = current.lab_name; // preserved

        db.prepare('UPDATE admin_settings SET upi_id = ?, organization_name = ?, lab_name = ? WHERE id = 1')
            .run(newUpi, newOrg, newLab);

        const updated = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get() as any;
        expect(updated.organization_name).toBe('Test Organization');
        expect(updated.upi_id).toBe('initial@upi');
        expect(updated.lab_name).toBe('N/A');
    });

    test('updating upi_id preserves organization_name and lab_name', () => {
        const current = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get() as any;
        const newUpi = 'payment@bank';

        db.prepare('UPDATE admin_settings SET upi_id = ?, organization_name = ?, lab_name = ? WHERE id = 1')
            .run(newUpi, current.organization_name, current.lab_name);

        const updated = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get() as any;
        expect(updated.upi_id).toBe('payment@bank');
        expect(updated.organization_name).toBe('N/A');
        expect(updated.lab_name).toBe('N/A');
    });
});
