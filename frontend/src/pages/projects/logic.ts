export interface ProjectFormData {
  name: string;
  client_id: string;
  description: string;
}

export interface ProjectPayload {
  name: string;
  client_id: number;
  description: string | null;
}

export function emptyProjectForm(clientId = ''): ProjectFormData {
  return {
    name: '',
    client_id: clientId,
    description: '',
  };
}

export function buildProjectPayload(form: ProjectFormData): ProjectPayload | null {
  const name = form.name.trim();
  const clientId = Number(form.client_id);
  if (!name || !form.client_id || Number.isNaN(clientId)) return null;
  return {
    name,
    client_id: clientId,
    description: form.description.trim() || null,
  };
}
