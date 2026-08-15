import { Link } from 'react-router-dom';
import { Button } from '../components/shared/ui';

export function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-32 text-center">
      <p className="font-display text-6xl font-bold text-ink-700">404</p>
      <h1 className="mt-4 text-xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-sm text-ink-400">That page doesn't exist in the hub.</p>
      <Link to="/">
        <Button className="mt-8">Back to the landing page</Button>
      </Link>
    </div>
  );
}
