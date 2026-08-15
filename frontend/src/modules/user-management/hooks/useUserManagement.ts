import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userManagementApi } from '../api/userManagement.api';

const USERS_KEY = ['user-management', 'users'] as const;
const BRANCHES_KEY = ['branches'] as const;

export function useManagedUsers() {
  return useQuery({ queryKey: USERS_KEY, queryFn: userManagementApi.users });
}

export function useManagedBranches() {
  return useQuery({ queryKey: BRANCHES_KEY, queryFn: userManagementApi.branches });
}

export function useCreateManagedUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: userManagementApi.createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}

export function useSetManagedUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive
        ? userManagementApi.updateUser(id, { isActive: true })
        : userManagementApi.deactivateUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });
}
