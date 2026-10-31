import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, useLoad } from '../components/ui';
import { useSession } from '../session';

export default function Join() {
  const { setUser } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const users = useLoad(() => api.users(), []);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function register(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { setUser(await api.register(name, email)); nav(next); } catch (err: any) { setError(err.message); }
  }

  return (
    <div className="stack narrow">
      <h1 className="page-title">Join the league</h1>
      <form className="card form" onSubmit={register}>
        <h2 className="section-title">New player</h2>
        <label>Display name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lions Fan 22" required /></label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
        <ErrorNote error={error} />
        <button className="btn btn-gold btn-lg">Let's go</button>
        <p className="fineprint">Prototype: no password. Already registered? Same email signs you back in.</p>
      </form>

      <div className="card">
        <h2 className="section-title">…or pick a demo player</h2>
        <div className="pick-grid">
          {users.data?.map((u) => (
            <button key={u.id} className="btn" onClick={() => { setUser(u); nav(next); }}>{u.displayName}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
