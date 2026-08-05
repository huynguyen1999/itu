import { useEffect, useState } from 'react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { api } from '../api/client';

type AuthenticatedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null;
  fallback?: ReactNode;
};

export function AuthenticatedImage({ src, fallback = null, onError, ...props }: AuthenticatedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setObjectUrl(null);
      setFailed(false);
      return;
    }

    let revoked = false;
    let nextObjectUrl: string | null = null;
    setFailed(false);

    void api
      .objectUrl(src)
      .then((url) => {
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        nextObjectUrl = url;
        setObjectUrl(url);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });

    return () => {
      revoked = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [src]);

  if (!src || failed || !objectUrl) return <>{fallback}</>;

  return (
    <img
      {...props}
      src={objectUrl}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
