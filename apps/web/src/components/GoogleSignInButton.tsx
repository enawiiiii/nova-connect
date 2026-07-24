import { useEffect, useRef } from 'react';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdApi {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode: 'popup';
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

function loadGoogleIdentity() {
  if (window.google?.accounts.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-nova-google-identity]');
    const script = existing ?? document.createElement('script');
    const loaded = () => window.google?.accounts.id
      ? resolve()
      : reject(new Error('Google Identity Services did not initialize'));
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', () => reject(new Error('Could not load Google Identity Services')), { once: true });
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.novaGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleScriptPromise = null;
    throw error;
  });
  return googleScriptPromise;
}

export function GoogleSignInButton({
  clientId,
  mode,
  onCredential,
  onError,
}: {
  clientId: string;
  mode: 'login' | 'register';
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const credentialHandler = useRef(onCredential);
  const errorHandler = useRef(onError);
  credentialHandler.current = onCredential;
  errorHandler.current = onError;

  useEffect(() => {
    let active = true;
    void loadGoogleIdentity().then(() => {
      if (!active || !container.current || !window.google?.accounts.id) return;
      container.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        callback: (response) => credentialHandler.current(response.credential),
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
    }).catch(() => {
      if (active) errorHandler.current('تعذر تحميل تسجيل الدخول عبر Google. تحقق من الاتصال ثم أعد المحاولة.');
    });
    return () => { active = false; };
  }, [clientId, mode]);

  return <div className="google-signin" ref={container} aria-label="تسجيل الدخول باستخدام Google" />;
}
