import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { NextFunction, Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serviceAccountPath = join(__dirname, '..', 'config', 'private', 'serviceAccountKey.json');

interface ServiceAccountWithWebConfig {
    project_id?: string;
    client_email?: string;
    private_key?: string;
    webConfig?: {
        apiKey?: string;
        authDomain?: string;
        appId?: string;
        messagingSenderId?: string;
    };
}

let serviceAccountRaw: string;
try {
    serviceAccountRaw = readFileSync(serviceAccountPath, 'utf-8');
} catch (error) {
    console.error(`[AUTH] Unable to read Firebase service account file at ${serviceAccountPath}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}

let serviceAccount: ServiceAccountWithWebConfig;
try {
    serviceAccount = JSON.parse(serviceAccountRaw);
} catch (error) {
    console.error('[AUTH] Failed to parse Firebase service account JSON. Ensure it is valid JSON.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}

const firebaseProjectId = serviceAccount.project_id;
const firebaseClientEmail = serviceAccount.client_email;
const firebasePrivateKey = serviceAccount.private_key;

const missingAdminFields = [
    ['project_id', firebaseProjectId],
    ['client_email', firebaseClientEmail],
    ['private_key', firebasePrivateKey],
].filter(([, value]) => !value).map(([key]) => key);

if (missingAdminFields.length > 0) {
    console.error(`[AUTH] Missing required field(s) in serviceAccountKey.json: ${missingAdminFields.join(', ')}`);
    process.exit(1);
}

const firebaseApp = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert({
            projectId: firebaseProjectId,
            clientEmail: firebaseClientEmail,
            privateKey: firebasePrivateKey,
        }),
    });

const firebaseAuth = getAuth(firebaseApp);

const derivedWebConfig = serviceAccount.webConfig ?? {};
const publicFirebaseConfig = {
    apiKey: derivedWebConfig.apiKey,
    authDomain: derivedWebConfig.authDomain,
    projectId: firebaseProjectId,
    appId: derivedWebConfig.appId,
    messagingSenderId: derivedWebConfig.messagingSenderId,
};

const missingWebConfig = Object.entries({
    apiKey: publicFirebaseConfig.apiKey,
    authDomain: publicFirebaseConfig.authDomain,
    appId: publicFirebaseConfig.appId,
    messagingSenderId: publicFirebaseConfig.messagingSenderId,
}).filter(([, value]) => !value).map(([key]) => key);

if (missingWebConfig.length > 0) {
    console.error('[AUTH] The serviceAccountKey.json file must include a "webConfig" object with apiKey, authDomain, appId, and messagingSenderId.');
    console.error(`Missing: ${missingWebConfig.join(', ')}`);
    process.exit(1);
}

export type AuthedRequest = Request & { user: admin.auth.DecodedIdToken };

function extractBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }

    const tokenHeader = req.headers['x-firebase-token'];
    if (typeof tokenHeader === 'string' && tokenHeader) {
        return tokenHeader.trim();
    }

    return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (req.session?.firebaseUser) {
            (req as AuthedRequest).user = req.session.firebaseUser;
            next();
            return;
        }

        const token = extractBearerToken(req);
        if (!token) {
            res.status(401).json({ error: 'Authorization token required' });
            return;
        }

        const decoded = await firebaseAuth.verifyIdToken(token);
        if (req.session) {
            req.session.firebaseUser = decoded;
        }
        (req as AuthedRequest).user = decoded;
        next();
    } catch (error) {
        console.error('[AUTH] Token verification failed:', error instanceof Error ? error.message : error);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

export function getFirebaseClientConfig() {
    return publicFirebaseConfig;
}

export { firebaseAuth };
