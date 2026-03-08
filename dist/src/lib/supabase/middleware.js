"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSession = updateSession;
const ssr_1 = require("@supabase/ssr");
const server_1 = require("next/server");
async function updateSession(request) {
    let response = server_1.NextResponse.next({
        request: {
            headers: request.headers,
        },
    });
    const supabase = (0, ssr_1.createServerClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
                response = server_1.NextResponse.next({
                    request,
                });
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            },
        },
    });
    const { data: { user }, } = await supabase.auth.getUser();
    if (!user &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/auth') &&
        !request.nextUrl.pathname.startsWith('/api') && // Allow API routes? Maybe need to protect them separately or rely on route handler checks
        !request.nextUrl.pathname.startsWith('/_next') &&
        !request.nextUrl.pathname.startsWith('/favicon.ico') &&
        request.nextUrl.pathname !== '/') {
        // no user, potentially redirect to login
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return server_1.NextResponse.redirect(url);
    }
    // If user is logged in and visits login page, redirect to dashboard
    if (user && request.nextUrl.pathname.startsWith('/login')) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return server_1.NextResponse.redirect(url);
    }
    return response;
}
