export interface Project {
  id: number;
  client_id: number;
  client_name: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_at_fmt: string;
  updated_at_fmt: string;
}

export interface ProjectClientOption {
  id: number;
  name: string;
}
