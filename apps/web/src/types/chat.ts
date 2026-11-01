export interface Citation {
  document: string;
  version?: string;
  article?: string;
  score?: number;
}

export interface ProposedAction {
  actionId?: string;
  type: string;
  requiresConfirmation?: boolean;
  preview?: string;
  args?: Record<string, unknown>;
  status?: 'pending' | 'confirmed' | 'cancelled';
}

export interface Attachment {
  title: string;
  type: 'pdf' | 'image';
  url: string;
  fileName: string;
}
