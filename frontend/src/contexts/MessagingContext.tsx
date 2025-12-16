import { createContext, useContext, useState, ReactNode } from 'react';

interface MessagingContextType {
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
}

const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

export function MessagingProvider({ children }: { children: ReactNode }) {
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  return (
    <MessagingContext.Provider value={{ activeConversationId, setActiveConversationId }}>
      {children}
    </MessagingContext.Provider>
  );
}

export function useMessagingContext() {
  const context = useContext(MessagingContext);
  if (context === undefined) {
    throw new Error('useMessagingContext must be used within a MessagingProvider');
  }
  return context;
}
