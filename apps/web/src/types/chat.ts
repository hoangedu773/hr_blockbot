export interface Citation {
  document: string;
  version?: string;
  article?: string;
  score?: number;
}

export interface Attachment {
  title: string;
  type: 'pdf' | 'image';
  url: string;
  fileName: string;
}
