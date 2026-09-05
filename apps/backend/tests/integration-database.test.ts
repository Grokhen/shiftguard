import { describe, expect, it } from 'vitest'
import {
  assertIntegrationEnvironment,
  integrationDatabaseUrl,
  quotedTestSchema,
} from '../integration/database.mjs'

const schema = `shiftguard_it_${'a'.repeat(32)}`
const databaseUrl = 'postgresql://test:test@127.0.0.1:55432/shiftguard_test'

describe('isolated PostgreSQL test target', () => {
  it.each([
    undefined,
    '',
    'postgresql://test:test@localhost/appdb',
    'postgresql://test:test@db.example.com/shiftguard_test',
    `${databaseUrl}?schema=public`,
    `${databaseUrl}?options=-csearch_path=public`,
    `${databaseUrl}#ignored`,
    'https://localhost/shiftguard_test',
  ])('rejects an ambiguous or non-test database target: %s', (input) => {
    expect(() => integrationDatabaseUrl(input, schema)).toThrow()
  })

  it.each(['public', 'shiftguard_it_existing', '"; DROP SCHEMA public; --', undefined])(
    'rejects a schema outside the generated namespace: %s',
    (input) => expect(() => quotedTestSchema(input)).toThrow(),
  )

  it('uses a distinct schema and enough connections for real concurrent transactions', () => {
    const target = new URL(integrationDatabaseUrl(databaseUrl, schema))
    expect(target.pathname).toBe('/shiftguard_test')
    expect(target.searchParams.get('schema')).toBe(schema)
    expect(target.searchParams.get('connection_limit')).toBe('5')
    expect(quotedTestSchema(schema)).toBe(`"${schema}"`)
  })

  it('requires the runner environment even when Vitest is invoked directly', () => {
    const env = {
      TEST_DATABASE_URL: databaseUrl,
      SHIFTGUARD_INTEGRATION_SCHEMA: schema,
      NODE_ENV: 'test',
      DATABASE_URL: integrationDatabaseUrl(databaseUrl, schema),
    }
    expect(() => assertIntegrationEnvironment(env)).not.toThrow()
    expect(() => assertIntegrationEnvironment({ ...env, DATABASE_URL: databaseUrl })).toThrow()
    expect(() => assertIntegrationEnvironment({ ...env, NODE_ENV: 'production' })).toThrow()
  })
})
