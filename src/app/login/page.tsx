'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import '../globals.css';

export default function LoginPage() {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPass] = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('El email es obligatorio'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Ingresá un email válido'); return; }
    if (!password) { setError('La contraseña es obligatoria'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError('Email o contraseña incorrectos');
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
      // loading queda true hasta que el componente se desmonte con la navegación
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #001a19 0%, #002725 60%, #003330 100%)',
      fontFamily: 'var(--font-body)',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.2rem',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-ocularyb.png"
            alt="OcularYB"
            style={{ height: 52, marginBottom: '1rem' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#dfefee', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>Panel de gestión</div>
          <div style={{ fontSize: '0.82rem', color: 'rgba(223,239,238,0.45)', marginTop: 4 }}>Ingresá tus credenciales para continuar</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(223,239,238,0.5)', fontWeight: 600 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            autoComplete="email"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: error ? '1px solid #f43f5e' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: '0.65rem 0.9rem',
              color: '#dfefee',
              fontSize: '0.95rem',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(223,239,238,0.5)', fontWeight: 600 }}>
            Contraseña
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoComplete="current-password"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: error ? '1px solid #f43f5e' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '0.65rem 2.5rem 0.65rem 0.9rem',
                color: '#dfefee',
                fontSize: '0.95rem',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: showPassword ? 'rgba(20,125,120,0.25)' : 'rgba(255,255,255,0.08)',
                border: showPassword ? '1px solid rgba(20,125,120,0.5)' : '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6, cursor: 'pointer',
                color: showPassword ? '#4ecdc4' : 'rgba(223,239,238,0.75)',
                padding: '4px 6px', lineHeight: 1, display: 'flex', alignItems: 'center',
              }}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '0.82rem', color: '#f43f5e', textAlign: 'center', background: 'rgba(244,63,94,0.08)', borderRadius: 8, padding: '0.5rem' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: 'linear-gradient(90deg, #147D78, #B8BD45)',
            border: 'none',
            borderRadius: 10,
            padding: '0.75rem',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.85 : 1,
            letterSpacing: '0.02em',
            marginTop: '0.2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {loading && (
            <span style={{
              width: 16, height: 16, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.35)',
              borderTopColor: '#fff',
              display: 'inline-block',
              animation: 'spin 0.7s linear infinite',
              flexShrink: 0,
            }} />
          )}
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
