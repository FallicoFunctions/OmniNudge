
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import featureFlagService from '../services/featureFlagService';
import { analyticsService } from '../services/analyticsService';
import { useAuth } from './AuthContext';

interface FeatureFlagContextType {
    flags: Record<string, boolean>;
    isLoading: boolean;
    isEnabled: (key: string) => boolean;
    refreshFlags: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextType | null>(null);

export function FeatureFlagProvider({ children }: { children: ReactNode }) {
    const [flags, setFlags] = useState<Record<string, boolean>>({});
    const [isLoading, setIsLoading] = useState(true);
    const { user } = useAuth();

    const refreshFlags = async () => {
        try {
            const allFlags = await featureFlagService.getAllFlagsWithStatus();
            setFlags(allFlags);

            // Sync with analytics service
            const enabledFlags = Object.entries(allFlags)
                .filter(([, enabled]) => enabled)
                .map(([key]) => key);

            analyticsService.setActiveFeatureFlags(enabledFlags);
        } catch (error) {
            console.error('Failed to fetch feature flags:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Avoid noisy 401s for anonymous visitors; flags are user-scoped.
        if (!user) {
            setFlags({});
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        refreshFlags();
    }, [user]); // Re-fetch when user changes

    useEffect(() => {
        const handleFlagUpdate = (event: Event) => {
            const customEvent = event as CustomEvent<{ key: string; enabled: boolean }>;
            const { key } = customEvent.detail;
            console.log('[FeatureFlagContext] Flag updated, refreshing...', key);
            refreshFlags();
        };

        window.addEventListener('feature-flag-updated', handleFlagUpdate);
        return () => {
            window.removeEventListener('feature-flag-updated', handleFlagUpdate);
        };
    }, []);

    const isEnabled = (key: string): boolean => {
        return !!flags[key];
    };

    return (
        <FeatureFlagContext.Provider value={{ flags, isLoading, isEnabled, refreshFlags }}>
            {children}
        </FeatureFlagContext.Provider>
    );
}

export function useFeatureFlags() {
    const context = useContext(FeatureFlagContext);
    if (!context) {
        throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
    }
    return context;
}
