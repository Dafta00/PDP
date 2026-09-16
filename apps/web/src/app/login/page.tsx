'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { isApiError } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Welcome / branding panel — desktop only; the form alone is the mobile experience. */}
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-brand-800 p-10 text-white lg:flex">
        <div className="absolute inset-x-0 top-0 h-1 bg-party-red" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <Image
            src="/brand/pdp-logo.jpeg"
            alt="Peoples Democratic Party"
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-white/30"
          />
          <div>
            <p className="font-heading text-sm font-semibold tracking-wide">PEOPLES DEMOCRATIC PARTY</p>
            <p className="text-xs text-brand-200">Gombe State</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/15">
            <Image
              src="/brand/candidate.jpg"
              alt="PDP Gombe State Gubernatorial Candidate"
              width={480}
              height={320}
              className="h-56 w-full object-cover object-top"
              priority
            />
            <div className="px-4 py-3">
              <p className="text-sm font-semibold">Gubernatorial Candidate</p>
              <p className="text-xs text-brand-200">Peoples Democratic Party — Gombe State</p>
            </div>
          </div>
          <div>
            <h1 className="font-heading text-2xl font-semibold leading-snug">
              Membership &amp; Administrative Management Platform
            </h1>
            <p className="mt-2 text-sm text-brand-200">
              A unified system for membership, organization, events, resources and reporting across
              Gombe State — from senatorial district to polling unit.
            </p>
          </div>
        </div>

        <p className="text-xs italic text-brand-200">&ldquo;Power to the People&rdquo;</p>
      </div>

      {/* Sign-in form */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Image
              src="/brand/pdp-logo.jpeg"
              alt="Peoples Democratic Party"
              width={48}
              height={48}
              className="mb-3 h-12 w-12 rounded-full object-cover ring-1 ring-slate-200"
            />
            <p className="font-heading text-lg font-semibold text-slate-900">PDP GOMBE STATE</p>
            <p className="text-sm text-slate-500">Membership &amp; Administrative Management Platform</p>
          </div>

          <div className="mb-6 hidden lg:block">
            <h2 className="font-heading text-xl font-semibold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Enter your credentials to access the platform.</p>
          </div>

          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-md border border-slate-200 bg-white p-6"
            noValidate
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Authorized personnel only. All activity is logged.
          </p>
        </div>
      </div>
    </div>
  );
}
