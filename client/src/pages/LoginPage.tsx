import { useState } from 'react';
import { App, Button, Form, Input, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { authApi, errorMessage } from '../api';
import { useAuth } from '../auth';

type Values = { fullName?: string; email: string; password: string; confirmPassword?: string };
export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [pending, setPending] = useState(false);
  const { message } = App.useApp();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<Values>();
  async function submit(values: Values) {
    setPending(true);
    try {
      const result = mode === 'login' ? await authApi.login({ email: values.email, password: values.password })
        : await authApi.register({ fullName: values.fullName!, email: values.email, password: values.password });
      signIn(result.user, result.token);
      message.success(mode === 'login' ? 'Welcome back' : 'Account created');
      navigate(result.user.role === 'ADMIN' ? '/admin' : '/customer', { replace: true });
    } catch (error) { message.error({ content: errorMessage(error), duration: 6 }); } finally { setPending(false); }
  }
  function switchMode() { setMode(mode === 'login' ? 'register' : 'login'); form.resetFields(); }
  return <main className="auth-page">
    <section className="auth-intro"><div className="auth-intro-content"><div className="brand brand-light">Care<span>Track</span></div><h1>Warranty claims,<br />clearly managed.</h1><p>Submit a claim, follow its progress, and keep every update in one place.</p></div></section>
    <section className="auth-form-side"><div className="auth-form-wrap"><div className="mobile-brand brand">Care<span>Track</span></div><Typography.Title level={2}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Typography.Title><p className="muted">{mode === 'login' ? 'Sign in to manage your warranty claims.' : 'Get started with CareTrack.'}</p>
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} size="large" className="auth-form">
        {mode === 'register' ? <Form.Item label="Full name" name="fullName" rules={[{ required: true, message: 'Enter your full name' }, { min: 2 }]}><Input placeholder="Your name" autoComplete="name" /></Form.Item> : null}
        <Form.Item label="Email address" name="email" rules={[{ required: true, message: 'Enter your email' }, { type: 'email', message: 'Enter a valid email' }]}><Input placeholder="you@example.com" autoComplete="email" /></Form.Item>
        <Form.Item label="Password" name="password" rules={[{ required: true, message: 'Enter your password' }, ...(mode === 'register' ? [{ min: 8, message: 'Use at least 8 characters' }] : [])]}><Input.Password placeholder="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Form.Item>
        {mode === 'register' ? <Form.Item label="Confirm password" name="confirmPassword" dependencies={['password']} rules={[{ required: true, message: 'Confirm your password' }, ({ getFieldValue }) => ({ validator(_, value) { return value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Passwords do not match')); } })]}><Input.Password placeholder="Repeat password" autoComplete="new-password" /></Form.Item> : null}
        <Button block type="primary" htmlType="submit" loading={pending}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
      </Form><p className="auth-switch">{mode === 'login' ? 'New to CareTrack?' : 'Already have an account?'} <Button type="link" onClick={switchMode}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Button></p>
    </div></section>
  </main>;
}
