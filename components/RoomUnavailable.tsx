import Link from 'next/link';

export default function RoomUnavailable({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4 font-mono">
        <h1 className="text-xl font-bold">Shared room unavailable</h1>
        <p role="alert" className="text-sm text-muted-foreground">{message}</p>
        <Link className="text-primary underline" href="/">Return to local karaoke</Link>
      </div>
    </div>
  );
}
