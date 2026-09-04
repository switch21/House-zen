/**
 * HOUSE-ZEN — TanStack Query hooks on top of the DataApi.
 * Query keys follow the convention ['hz', entity, ...scope].
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDataApi } from '@/lib/api';
import type { EntityName, ListParams } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/context';
import type { UUID } from '@/types/domain';

export function useEntityList<T>(entity: EntityName, params?: ListParams, enabled = true) {
  const api = getDataApi();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['hz', entity, session?.tenant?.id ?? 'none', params ?? {}],
    queryFn: () => api.list<T>(entity, params),
    enabled: enabled && Boolean(session),
  });
}

export function useEntity<T>(entity: EntityName, id: UUID | undefined, enabled = true) {
  const api = getDataApi();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['hz', entity, 'one', id, session?.tenant?.id ?? 'none'],
    queryFn: () => api.get<T>(entity, id as UUID),
    enabled: enabled && Boolean(id) && Boolean(session),
  });
}

/** Generic create/update/delete mutation with cache invalidation. */
export function useEntityMutations(entity: EntityName) {
  const qc = useQueryClient();
  const api = getDataApi();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hz', entity] });
  };

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.create(entity, data),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: UUID; data: Record<string, unknown> }) => api.update(entity, id, data),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: UUID) => api.remove(entity, id),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/** Notification invalidation helper for domain mutations. */
export function useInvalidateHz() {
  const qc = useQueryClient();
  return (entities: EntityName[]) =>
    entities.forEach((e) => qc.invalidateQueries({ queryKey: ['hz', e] }));
}
