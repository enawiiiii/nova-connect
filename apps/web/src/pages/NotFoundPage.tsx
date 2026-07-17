import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
export function NotFoundPage() { return <div className="simple-page"><Brand /><div className="simple-card"><span className="error-code">404 / LOST SIGNAL</span><h1>Outside the orbit.</h1><p>That corner of space doesn’t exist.</p><Link className="button button-primary" to="/">Return home</Link></div></div>; }
