import { useEffect, useRef, useState } from 'react';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdApi {
  initialize: (options: {
    client_id: string;
    callback?: (response: GoogleCredentialResponse) => void;
    ux_mode: 'popup' | 'redirect';
    login_uri?: string;
    itp_support?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: {
    type: 'standard';
    theme: 'filled_black';
    size: 'large';
    shape: 'rectangular';
    text: 'continue_with' | 'signin_with' | 'signup_with';
    width: number;
    logo_alignment: 'left';
  }) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

let googleScriptPromise: Promise<void> | null = null;
const GOOGLE_SCRIPT_SELECTOR = 'script[data-nova-google-identity]';
const GOOGLE_SCRIPT_TIMEOUT_MS = 10_000;

function loadGoogleIdentity() {
  if (window.google?.accounts.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(GOOGLE_SCRIPT_SELECTOR);
    const script = existing ?? document.createElement('script');
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
      if (error) reject(error);
      else resolve();
    };
    const loaded = () => window.google?.accounts.id
      ? finish()
      : finish(new Error('Google Identity Services did not initialize'));
    const failed = () => finish(new Error('Could not load Google Identity Services'));
    const timeout = window.setTimeout(
      () => finish(new Error('Google Identity Services timed out')),
      GOOGLE_SCRIPT_TIMEOUT_MS,
    );
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.novaGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleScriptPromise = null;
    document.querySelector<HTMLScriptElement>(GOOGLE_SCRIPT_SELECTOR)?.remove();
    throw error;
  });
  return googleScriptPromise;
}

export function GoogleSignInButton({
  clientId,
  mode,
  redirectUri,
  onCredential,
  onError,
}: {
  clientId: string;
  mode: 'login' | 'register';
  redirectUri?: string;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const credentialHandler = useRef(onCredential);
  const errorHandler = useRef(onError);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  credentialHandler.current = onCredential;
  errorHandler.current = onError;

  useEffect(() => {
    let active = true;
    setStatus('loading');
    void loadGoogleIdentity().then(() => {
      if (!active || !container.current || !window.google?.accounts.id) return;
      container.current.replaceChildren();
      window.google.accounts.id.initialize(redirectUri ? {
        client_id: clientId,
        ux_mode: 'redirect',
        login_uri: redirectUri,
        itp_support: true,
      } : {
        client_id: clientId,
        ux_mode: 'popup',
        callback: (response) => credentialHandler.current(response.credential),
        itp_support: true,
      });
      window.google.accounts.id.renderButton(container.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        shape: 'rectangular',
        text: mode === 'register' ? 'signup_with' : 'signin_with',
        width: Math.min(400, Math.max(240, container.current.clientWidth || 400)),
        logo_alignment: 'left',
      });
      setStatus('ready');
    }).catch(() => {
      if (!active) return;
      setStatus('error');
      errorHandler.current('تعذر تحميل تسجيل الدخول عبر Google. تحقق من الاتصال ثم أعد المحاولة.');
    });
    return () => { active = false; };
  }, [attempt, clientId, mode, redirectUri]);

  const retry = () => {
    googleScriptPromise = null;
    document.querySelector<HTMLScriptElement>(GOOGLE_SCRIPT_SELECTOR)?.remove();
    setAttempt((value) => value + 1);
  };

  return (
    <div className={`google-signin-shell google-signin-${status}`} aria-label="تسجيل الدخول باستخدام Google">
      {status === 'loading' && <span className="google-signin-loading"><i />جارٍ تحميل تسجيل الدخول عبر Google…</span>}
      {status === 'error' && (
        <div className="google-signin-error" role="alert">
          <span>تعذر تحميل زر Google.</span>
          <button type="button" onClick={retry}>إعادة المحاولة</button>
        </div>
      )}
      <div className="google-signin" ref={container} aria-hidden={status !== 'ready'} />
    </div>
  );
}
