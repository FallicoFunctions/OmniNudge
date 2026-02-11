import type { ReactNode } from 'react';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';

interface FeatureGateProps {
    feature: string;
    children: ReactNode;
    fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
    const isEnabled = useFeatureFlag(feature);

    if (isEnabled) {
        return <>{children}</>;
    }

    return <>{fallback}</>;
}
