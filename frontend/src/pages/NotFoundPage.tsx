import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">404</p>
        <h1 className="mt-2 text-4xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-4 text-lg text-gray-600">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700"
          >
            Go to Home
          </Link>
          <Link
            to="/hubs"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 px-6 py-3 text-gray-700 font-medium hover:bg-gray-100"
          >
            Browse Hubs
          </Link>
        </div>
      </div>
    </div>
  );
}
