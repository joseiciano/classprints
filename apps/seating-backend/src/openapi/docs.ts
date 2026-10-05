import { swaggerUI } from '@hono/swagger-ui';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { generateAuthOpenApiSchema, type AuthDeps } from '@classprints/server/auth';
import type { SeatingHonoEnv, SeatingWorkerBindings } from '../types/env';
import { CSRF_SECURITY_SCHEME, SESSION_COOKIE_SECURITY_SCHEME } from './schemas';

/** Docs are served everywhere except production. */
export const isApiDocsEnabled = (env: Pick<SeatingWorkerBindings, 'ENVIRONMENT'>): boolean =>
  env.ENVIRONMENT !== 'production';

const docsEnabledOnly: MiddlewareHandler<SeatingHonoEnv> = async (c, next) =>
  isApiDocsEnabled(c.env) ? next() : c.notFound();

export interface ApiDocsOptions {
  authDeps: AuthDeps<SeatingWorkerBindings>;
  /** Full mount path of Better Auth's native handler, e.g. `/api/v1/auth/better-auth`. */
  authBasePath: (env: SeatingWorkerBindings) => string;
}

/**
 * Registers `/openapi.json` and `/docs`. The routes exist in every environment
 * but answer 404 in production, checked per request.
 */
export const registerApiDocs = (
  app: OpenAPIHono<SeatingHonoEnv>,
  { authDeps, authBasePath }: ApiDocsOptions,
): void => {
  app.openAPIRegistry.registerComponent('securitySchemes', SESSION_COOKIE_SECURITY_SCHEME, {
    type: 'apiKey',
    in: 'cookie',
    name: 'better-auth.session_token',
    description:
      'Better Auth session cookie (`__Secure-` prefixed over HTTPS). Sign in via POST /api/v1/auth/sign-in from this page and the browser attaches it to later calls.',
  });

  app.openAPIRegistry.registerComponent('securitySchemes', CSRF_SECURITY_SCHEME, {
    type: 'apiKey',
    in: 'header',
    name: 'X-CSRF-Token',
    description:
      'Double-submit token required on POST/PUT/PATCH/DELETE. Must equal the `seating_csrf_token` cookie set at sign-in; copy that cookie value here.',
  });

  app.get('/openapi.json', docsEnabledOnly, async (c) => {
    const origin = new URL(c.req.url).origin;
    const document = app.getOpenAPIDocument({
      openapi: '3.0.3',
      info: {
        title: 'ClassPrints API',
        version: '0.1.0',
        description: 'Seating arrangement API',
      },
      servers: [{ url: origin }],
    });

    // Better Auth's native endpoints are served by its own handler, so they are
    // not in the route registry; merge its generated schema under the mount path.
    const authSchema = await generateAuthOpenApiSchema(authDeps, c.env, origin);
    const mountPath = authBasePath(c.env);
    const authPaths = Object.fromEntries(
      Object.entries(authSchema.paths ?? {}).map(([path, item]) => [`${mountPath}${path}`, item]),
    );

    return c.json({
      ...document,
      paths: { ...document.paths, ...authPaths },
      components: {
        ...document.components,
        schemas: { ...authSchema.components?.schemas, ...document.components?.schemas },
      },
    });
  });

  // Relative URL: `/docs` and `/openapi.json` are siblings under any BASE_PATH.
  app.get('/docs', docsEnabledOnly, swaggerUI({ url: 'openapi.json' }));
};
