const schemaPattern = /^shiftguard_it_[a-f0-9]{32}$/

export function quotedTestSchema(schema) {
  if (!schemaPattern.test(schema ?? '')) throw new Error('Esquema de integración inválido')
  return `"${schema}"`
}

export function integrationDatabaseUrl(input, schema) {
  quotedTestSchema(schema)
  let url
  try {
    url = new URL(input)
  } catch {
    throw new Error('Define TEST_DATABASE_URL para una base local llamada shiftguard_test')
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/shiftguard_test' ||
    url.search ||
    url.hash
  ) {
    throw new Error('TEST_DATABASE_URL debe apuntar a shiftguard_test en loopback, sin parámetros')
  }
  url.searchParams.set('schema', schema)
  url.searchParams.set('connection_limit', '5')
  url.searchParams.set('connect_timeout', '5')
  return url.toString()
}

export function assertIntegrationEnvironment(env) {
  const expected = integrationDatabaseUrl(env.TEST_DATABASE_URL, env.SHIFTGUARD_INTEGRATION_SCHEMA)
  if (env.NODE_ENV !== 'test' || env.DATABASE_URL !== expected) {
    throw new Error('Ejecuta las pruebas mediante npm run test:integration')
  }
}
