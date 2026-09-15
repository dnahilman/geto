import type { Completion } from '@codemirror/autocomplete'
import { withTrailingSpace } from './apply'

/**
 * Standard reserved keywords that cannot be used as unquoted identifiers.
 * When a table or column has one of these names, it must be inserted quoted.
 */
export const PG_RESERVED = new Set(
  (
    'user order group table column schema index view role session name value type cast ' +
    'only default end case when then else null true false between and or not as from ' +
    'where join on into set returning create drop alter add constraint primary key ' +
    'foreign references unique check cascade with recursive having distinct union all ' +
    'limit offset select insert update delete begin commit rollback using natural cross'
  )
    .split(' ')
    .map((s) => s.toUpperCase()),
)

/**
 * Check whether an identifier name requires quotation marks (e.g. "user", "order").
 */
export function needsQuoting(name: string): boolean {
  return PG_RESERVED.has(name.toUpperCase()) || /[^a-z0-9_]/.test(name) || /^\d/.test(name)
}

/**
 * Standard uppercase SQL keywords for completion-driven capitalization.
 * Enables typing `fro` -> `FROM`, `whe` -> `WHERE`, `ord` -> `ORDER BY`.
 * Automatically appends a trailing space on selection (DataGrip behavior).
 */
const RAW_SQL_KEYWORDS: Completion[] = [
  // Query verbs
  { label: 'SELECT', type: 'keyword', boost: 10 },
  { label: 'FROM', type: 'keyword', boost: 10 },
  { label: 'WHERE', type: 'keyword', boost: 10 },
  { label: 'GROUP BY', type: 'keyword', boost: 9 },
  { label: 'HAVING', type: 'keyword', boost: 8 },
  { label: 'ORDER BY', type: 'keyword', boost: 9 },
  { label: 'LIMIT', type: 'keyword', boost: 8 },
  { label: 'OFFSET', type: 'keyword', boost: 7 },
  { label: 'DISTINCT', type: 'keyword', boost: 7 },
  { label: 'AS', type: 'keyword', boost: 6 },

  // Joins
  { label: 'JOIN', type: 'keyword', boost: 9 },
  { label: 'INNER JOIN', type: 'keyword', boost: 9 },
  { label: 'LEFT JOIN', type: 'keyword', boost: 9 },
  { label: 'RIGHT JOIN', type: 'keyword', boost: 8 },
  { label: 'FULL OUTER JOIN', type: 'keyword', boost: 7 },
  { label: 'CROSS JOIN', type: 'keyword', boost: 7 },
  { label: 'ON', type: 'keyword', boost: 9 },
  { label: 'USING', type: 'keyword', boost: 7 },

  // DML
  { label: 'INSERT INTO', type: 'keyword', boost: 9 },
  { label: 'VALUES', type: 'keyword', boost: 9 },
  { label: 'UPDATE', type: 'keyword', boost: 9 },
  { label: 'SET', type: 'keyword', boost: 9 },
  { label: 'DELETE FROM', type: 'keyword', boost: 9 },
  { label: 'RETURNING', type: 'keyword', boost: 8 },

  // Logical operators
  { label: 'AND', type: 'keyword', boost: 8 },
  { label: 'OR', type: 'keyword', boost: 8 },
  { label: 'NOT', type: 'keyword', boost: 8 },
  { label: 'IN', type: 'keyword', boost: 8 },
  { label: 'IS NULL', type: 'keyword', boost: 8 },
  { label: 'IS NOT NULL', type: 'keyword', boost: 8 },
  { label: 'BETWEEN', type: 'keyword', boost: 8 },
  { label: 'LIKE', type: 'keyword', boost: 8 },
  { label: 'ILIKE', type: 'keyword', boost: 8 },
  { label: 'EXISTS', type: 'keyword', boost: 8 },

  // Set operations & CTE
  { label: 'UNION', type: 'keyword', boost: 7 },
  { label: 'UNION ALL', type: 'keyword', boost: 7 },
  { label: 'INTERSECT', type: 'keyword', boost: 6 },
  { label: 'EXCEPT', type: 'keyword', boost: 6 },
  { label: 'WITH', type: 'keyword', boost: 8 },
  { label: 'RECURSIVE', type: 'keyword', boost: 7 },

  // Conditionals
  { label: 'CASE', type: 'keyword', boost: 7 },
  { label: 'WHEN', type: 'keyword', boost: 7 },
  { label: 'THEN', type: 'keyword', boost: 7 },
  { label: 'ELSE', type: 'keyword', boost: 7 },
  { label: 'END', type: 'keyword', boost: 7 },

  // DDL
  { label: 'CREATE TABLE', type: 'keyword', boost: 6 },
  { label: 'ALTER TABLE', type: 'keyword', boost: 6 },
  { label: 'DROP TABLE', type: 'keyword', boost: 6 },
  { label: 'CREATE INDEX', type: 'keyword', boost: 5 },
  { label: 'DROP INDEX', type: 'keyword', boost: 5 },
  { label: 'CREATE VIEW', type: 'keyword', boost: 5 },
  { label: 'DROP VIEW', type: 'keyword', boost: 5 },
  { label: 'PRIMARY KEY', type: 'keyword', boost: 6 },
  { label: 'FOREIGN KEY', type: 'keyword', boost: 6 },
  { label: 'REFERENCES', type: 'keyword', boost: 6 },
  { label: 'CONSTRAINT', type: 'keyword', boost: 6 },
  { label: 'DEFAULT', type: 'keyword', boost: 6 },
  { label: 'CASCADE', type: 'keyword', boost: 5 },
  { label: 'TRUNCATE', type: 'keyword', boost: 5 },

  // Transactions
  { label: 'BEGIN', type: 'keyword', boost: 5 },
  { label: 'COMMIT', type: 'keyword', boost: 5 },
  { label: 'ROLLBACK', type: 'keyword', boost: 5 },
]

export const STANDARD_SQL_KEYWORDS: Completion[] = RAW_SQL_KEYWORDS.map((k) => withTrailingSpace(k))
