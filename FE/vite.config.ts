import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { proxy } from './vite.proxy';

// 시연 모드(`pnpm dev:demo`) 전용 가짜 로그인. 백엔드·DB 없이 화면을 보기 위한 것으로,
// 개발 서버에서만 동작하고 빌드 결과물에는 들어가지 않는다. 비밀번호가 'wrong'이 아니면 모두 통과한다.
const DEMO_USER = {
  id: 1,
  employee_no: 'A9001',
  display_name: '박민규',
  role: 'admin',
  must_change_password: false,
};

function demoAuth(): Plugin {
  return {
    name: 'demo-auth',
    configureServer(server) {
      server.config.logger.info(
        '\n  시연 모드: 로그인은 가짜 계정으로 처리됩니다(실제 인증 아님).\n',
      );
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (!path?.startsWith('/api/v1/auth/')) return next();
        const cookies = Object.fromEntries(
          (req.headers.cookie ?? '').split(';').map((part) => part.trim().split('=')),
        );
        const send = (status: number, body?: unknown, setCookies: string[] = []) => {
          res.statusCode = status;
          res.setHeader('Cache-Control', 'no-store');
          if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
          if (body === undefined) return res.end();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };
        const fail = (status: number, code: string, message: string) =>
          send(status, { detail: { code, message } });

        if (req.method === 'GET' && path === '/api/v1/auth/me') {
          return cookies.imleader_access_token === 'demo-access'
            ? send(200, DEMO_USER)
            : fail(401, 'AUTHENTICATION_REQUIRED', '로그인이 필요합니다.');
        }
        if (req.method !== 'POST') return fail(404, 'NOT_FOUND', '없음');

        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
          if (path === '/api/v1/auth/login') {
            const body = raw ? (JSON.parse(raw) as { password?: string }) : {};
            if (body.password === 'wrong') {
              return fail(401, 'INVALID_CREDENTIALS', '사번 또는 비밀번호가 올바르지 않습니다.');
            }
            return send(200, DEMO_USER, [
              'imleader_access_token=demo-access; Path=/; HttpOnly; SameSite=Lax',
              'imleader_refresh_token=demo-refresh; Path=/api/v1/auth; HttpOnly; SameSite=Lax',
              'imleader_csrf_token=demo-csrf; Path=/; SameSite=Lax',
            ]);
          }
          if (path === '/api/v1/auth/refresh') {
            return cookies.imleader_refresh_token === 'demo-refresh'
              ? send(200, DEMO_USER)
              : fail(
                  401,
                  'INVALID_REFRESH_TOKEN',
                  '로그인이 만료되었습니다. 다시 로그인해 주세요.',
                );
          }
          if (path === '/api/v1/auth/logout') {
            return send(204, undefined, [
              'imleader_access_token=; Path=/; Max-Age=0',
              'imleader_refresh_token=; Path=/api/v1/auth; Max-Age=0',
              'imleader_csrf_token=; Path=/; Max-Age=0',
            ]);
          }
          fail(404, 'NOT_FOUND', '없음');
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'demo' ? [demoAuth()] : [])],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
}));
