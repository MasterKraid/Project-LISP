import { createTestDb } from './setup';

describe('Master Packages & Alias Uploads', () => {
    let db: ReturnType<typeof createTestDb>;

    beforeEach(() => {
        db = createTestDb();
    });

    it('starts with an empty master packages table', () => {
        const rows = db.prepare('SELECT * FROM master_packages').all();
        expect(rows).toHaveLength(0);
    });

    it('creates a master package without requiring code_name', () => {
        const insert = db.prepare('INSERT INTO master_packages (name, created_at) VALUES (?, ?)');
        const res = insert.run('Complete Blood Count', new Date().toISOString());
        expect(res.lastInsertRowid).toBeDefined();

        const insertAlias = db.prepare('INSERT INTO master_package_aliases (master_package_id, alias_name) VALUES (?, ?)');
        insertAlias.run(Number(res.lastInsertRowid), 'CBC');
        insertAlias.run(Number(res.lastInsertRowid), 'HEMOGRAM');

        const pkg = db.prepare('SELECT * FROM master_packages WHERE id = ?').get(res.lastInsertRowid) as any;
        expect(pkg.name).toBe('Complete Blood Count');
        expect(pkg.code_name).toBeUndefined();

        const aliases = db.prepare('SELECT alias_name FROM master_package_aliases WHERE master_package_id = ?').all(res.lastInsertRowid) as any[];
        expect(aliases.map(a => a.alias_name)).toEqual(['CBC', 'HEMOGRAM']);
    });

    it('supports OVERWRITE mode replacing all previous records', () => {
        // Initial package
        const initial = db.prepare('INSERT INTO master_packages (name, created_at) VALUES (?, ?)').run('Old Test', new Date().toISOString());
        db.prepare('INSERT INTO master_package_aliases (master_package_id, alias_name) VALUES (?, ?)').run(Number(initial.lastInsertRowid), 'OLD');

        expect(db.prepare('SELECT count(*) as c FROM master_packages').get()).toEqual({ c: 1 });

        // Simulate OVERWRITE
        const overwriteTx = db.transaction((items: Array<{ test_name: string; aliases: string[] }>) => {
            db.exec('DELETE FROM master_package_aliases; DELETE FROM master_packages;');
            const insertMaster = db.prepare('INSERT INTO master_packages (name, created_at) VALUES (?, ?)');
            const insertAlias = db.prepare('INSERT OR IGNORE INTO master_package_aliases (master_package_id, alias_name) VALUES (?, ?)');

            for (const item of items) {
                const res = insertMaster.run(item.test_name, new Date().toISOString());
                const masterId = Number(res.lastInsertRowid);
                for (const alias of item.aliases) {
                    if (alias.trim()) {
                        insertAlias.run(masterId, alias.trim());
                    }
                }
            }
        });

        overwriteTx([
            { test_name: 'Lipid Profile', aliases: ['LIPID', 'LIPID SCREEN'] },
            { test_name: 'Liver Function Test', aliases: ['LFT', 'LIVER PANEL'] }
        ]);

        const allPkgs = db.prepare('SELECT name FROM master_packages ORDER BY name ASC').all() as any[];
        expect(allPkgs.map(p => p.name)).toEqual(['Lipid Profile', 'Liver Function Test']);

        const allAliases = db.prepare('SELECT alias_name FROM master_package_aliases ORDER BY alias_name ASC').all() as any[];
        expect(allAliases.map(a => a.alias_name)).toEqual(['LFT', 'LIPID', 'LIPID SCREEN', 'LIVER PANEL']);
    });

    it('supports APPEND mode preserving existing records and adding new ones', () => {
        const insertMaster = db.prepare('INSERT INTO master_packages (name, created_at) VALUES (?, ?)');
        const insertAlias = db.prepare('INSERT OR IGNORE INTO master_package_aliases (master_package_id, alias_name) VALUES (?, ?)');
        const initial = insertMaster.run('Thyroid Profile', new Date().toISOString());
        insertAlias.run(Number(initial.lastInsertRowid), 'TFT');

        // Simulate APPEND
        const appendTx = db.transaction((items: Array<{ test_name: string; aliases: string[] }>) => {
            for (const item of items) {
                let master = db.prepare('SELECT id FROM master_packages WHERE name = ? COLLATE NOCASE').get(item.test_name) as any;
                let masterId: number;
                if (!master) {
                    const res = insertMaster.run(item.test_name, new Date().toISOString());
                    masterId = Number(res.lastInsertRowid);
                } else {
                    masterId = master.id;
                }
                for (const alias of item.aliases) {
                    if (alias.trim()) {
                        insertAlias.run(masterId, alias.trim());
                    }
                }
            }
        });

        appendTx([
            { test_name: 'Thyroid Profile', aliases: ['THYROID 3'] },
            { test_name: 'Vitamin D', aliases: ['VIT D', '25-OH VITAMIN D'] }
        ]);

        const allPkgs = db.prepare('SELECT name FROM master_packages ORDER BY name ASC').all() as any[];
        expect(allPkgs.map(p => p.name)).toEqual(['Thyroid Profile', 'Vitamin D']);

        const thyroidAliases = db.prepare('SELECT alias_name FROM master_package_aliases WHERE master_package_id = ? ORDER BY alias_name ASC').all(initial.lastInsertRowid) as any[];
        expect(thyroidAliases.map(a => a.alias_name)).toEqual(['TFT', 'THYROID 3']);
    });
});
