/**
 * SQL splitter unit tests — validates against ACTUAL migration files.
 * Security-relevant: incorrect splitting could tear SECURITY DEFINER function
 * bodies or RLS DO-blocks apart.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { splitStatements } from '../src/sql-splitter.js';

const MIGRATIONS_DIR = resolve(__dirname, '../migrations');

function readMigration(filename: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf-8');
}

describe('splitStatements', () => {
  describe('basic splitting', () => {
    it('splits simple multi-statement SQL', () => {
      const sql = 'CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);';
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toContain('CREATE TABLE a');
      expect(stmts[1]).toContain('CREATE TABLE b');
    });

    it('skips empty/whitespace-only statements', () => {
      const sql = 'SELECT 1;\n\n;\n  \n;SELECT 2;';
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(2);
    });

    it('handles trailing content without final semicolon', () => {
      const sql = 'SELECT 1;\nSELECT 2';
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(2);
    });
  });

  describe('dollar-quote awareness', () => {
    it('does NOT split inside $$ blocks', () => {
      const sql = `CREATE FUNCTION f() RETURNS void AS $$
BEGIN
  RAISE NOTICE 'hello; world';
  INSERT INTO t VALUES (1);
END;
$$ LANGUAGE plpgsql;
SELECT 1;`;
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toContain('$$');
      expect(stmts[0]).toContain('INSERT INTO t VALUES (1);');
    });

    it('does NOT split inside tagged $tag$ blocks', () => {
      const sql = `DO $body$
BEGIN
  EXECUTE 'CREATE POLICY p; DROP TABLE t;';
END;
$body$;
SELECT 2;`;
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toContain('$body$');
      expect(stmts[0]).toContain('CREATE POLICY p; DROP TABLE t;');
    });

    it('handles nested semicolons + single-quote escapes inside $$', () => {
      const sql = `CREATE FUNCTION x() RETURNS void AS $$
BEGIN
  EXECUTE format('CREATE POLICY t ON %I.%I FOR ALL USING (tenant_id = current_setting(''app.tenant_id'', true))', 'schema', 'table');
END;
$$ LANGUAGE plpgsql;`;
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(1);
      expect(stmts[0]).toContain("current_setting(''app.tenant_id''");
    });
  });

  describe('single-quote awareness', () => {
    it('does NOT split inside single-quoted strings', () => {
      const sql = "INSERT INTO t (val) VALUES ('hello; world');\nSELECT 1;";
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toContain("'hello; world'");
    });

    it('handles escaped quotes (double single-quote)', () => {
      const sql = "INSERT INTO t (val) VALUES ('it''s; a test');\nSELECT 2;";
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toContain("'it''s; a test'");
    });
  });

  describe('comment awareness', () => {
    it('does NOT split on semicolons in line comments', () => {
      const sql = '-- comment with; semicolon\nSELECT 1;\nSELECT 2;';
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(2);
    });

    it('does NOT split on semicolons in block comments', () => {
      const sql = '/* comment; with; semis */\nSELECT 1;\nSELECT 2;';
      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(2);
    });
  });

  describe('actual migration files', () => {
    it('001_create_schemas.sql: splits into expected statement count', () => {
      const sql = readMigration('001_create_schemas.sql');
      const stmts = splitStatements(sql);
      // 6 CREATE SCHEMA + 1 CREATE TABLE = 7
      expect(stmts.length).toBeGreaterThanOrEqual(7);
      stmts.forEach((s) => expect(s).not.toBe(''));
    });

    it('002_m1_document_studio.sql: splits correctly', () => {
      const sql = readMigration('002_m1_document_studio.sql');
      const stmts = splitStatements(sql);
      // 6 CREATE TABLE + 4 CREATE INDEX = 10
      expect(stmts.length).toBeGreaterThanOrEqual(10);
    });

    it('007_rls_policies.sql: does NOT split inside DO $$ blocks', () => {
      const sql = readMigration('007_rls_policies.sql');
      const stmts = splitStatements(sql);
      // ALTER TABLE ENABLE (23) + 1 DO block (CREATE POLICY) + ALTER TABLE FORCE (1 DO block) = ~25
      // The DO blocks are SINGLE statements (not torn apart)
      for (const stmt of stmts) {
        // If a stmt starts with DO, it must contain both BEGIN and END
        if (stmt.trim().startsWith('DO')) {
          expect(stmt).toContain('BEGIN');
          expect(stmt).toContain('END');
        }
      }
    });

    it('008_risk_register_view.sql: SECURITY DEFINER function body is ONE statement', () => {
      const sql = readMigration('008_risk_register_view.sql');
      const stmts = splitStatements(sql);
      // Find the CREATE FUNCTION statement (not the comment that mentions it)
      const fnStmt = stmts.find(
        (s) => s.includes('CREATE OR REPLACE FUNCTION') && s.includes('SECURITY DEFINER'),
      );
      expect(fnStmt).toBeDefined();
      // It must contain the full function body (WHERE clause inside $$)
      expect(fnStmt).toContain('current_setting');
      expect(fnStmt).toContain('AS $$');
      // The statement must contain both the opening and closing $$
      expect(fnStmt!.indexOf('AS $$')).toBeLessThan(fnStmt!.lastIndexOf('$$'));
    });

    it('009_app_role.sql: DO block is not torn apart', () => {
      const sql = readMigration('009_app_role.sql');
      const stmts = splitStatements(sql);
      const doStmt = stmts.find((s) => s.includes('DO $$'));
      expect(doStmt).toBeDefined();
      expect(doStmt).toContain('BEGIN');
      expect(doStmt).toContain('END');
    });

    it('no migration file produces empty statements after splitting', () => {
      const files = [
        '001_create_schemas.sql',
        '002_m1_document_studio.sql',
        '003_m2_capa.sql',
        '004_m3_audit_studio.sql',
        '005_m4_records_management.sql',
        '006_m5_risk_management.sql',
        '007_rls_policies.sql',
        '008_risk_register_view.sql',
        '009_app_role.sql',
        '010_risk_register_refresh.sql',
      ];

      for (const file of files) {
        const sql = readMigration(file);
        const stmts = splitStatements(sql);
        expect(stmts.length).toBeGreaterThan(0);
        for (const stmt of stmts) {
          expect(stmt.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('targeted security fixture', () => {
    it('function body with multiple semicolons and nested quotes → ONE statement', () => {
      const sql = [
        'CREATE OR REPLACE FUNCTION m5_views.get_risk()',
        'RETURNS SETOF m5_views.risk_register_view',
        'LANGUAGE sql',
        'SECURITY DEFINER',
        'SET search_path = m5_views, m5, pg_temp',
        'AS $$',
        '  SELECT * FROM m5_views.risk_register_view',
        "  WHERE tenant_id = current_setting('app.tenant_id', true);",
        '$$;',
        '',
        'REVOKE ALL ON m5_views.risk_register_view FROM app_role;',
        'GRANT EXECUTE ON FUNCTION m5_views.get_risk() TO app_role;',
      ].join('\n');

      const stmts = splitStatements(sql);
      expect(stmts).toHaveLength(3); // CREATE FUNCTION, REVOKE, GRANT
      expect(stmts[0]).toContain('SECURITY DEFINER');
      expect(stmts[0]).toContain("current_setting('app.tenant_id', true)");
      expect(stmts[1]).toContain('REVOKE');
      expect(stmts[2]).toContain('GRANT');
    });
  });
});
