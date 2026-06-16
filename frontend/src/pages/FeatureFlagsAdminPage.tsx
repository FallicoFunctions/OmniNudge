import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import featureFlagService, { type CreateFeatureFlagRequest } from '../services/featureFlagService';
import { useFormat } from '../hooks/useFormat';
import type { FeatureFlagAudit, FeatureFlag } from '../types/featureFlags';

export default function AdminFeatureFlags() {
  const { t } = useTranslation();
  const { formatDate, formatNumber } = useFormat();
  const queryClient = useQueryClient();
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Queries
  const { data: flags, isLoading } = useQuery({
    queryKey: ['admin-feature-flags'],
    queryFn: featureFlagService.getFlags,
  });

  const { data: auditLog } = useQuery({
    queryKey: ['feature-flag-audit', selectedFlag],
    queryFn: () =>
      selectedFlag ? featureFlagService.getAuditLog(selectedFlag) : Promise.resolve([]),
    enabled: !!selectedFlag,
  });

  // Mutations
  const updateFlagMutation = useMutation({
    mutationFn: ({ key, data }: { key: string; data: Partial<FeatureFlag> }) =>
      featureFlagService.updateFlag(key, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] });
    },
  });

  const createFlagMutation = useMutation({
    mutationFn: featureFlagService.createFlag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] });
      setIsCreateModalOpen(false);
    },
  });

  const deleteFlagMutation = useMutation({
    mutationFn: featureFlagService.deleteFlag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] });
      if (selectedFlag) setSelectedFlag(null);
    },
  });

  // Listen for real-time updates
  useEffect(() => {
    const handleUpdate = () => {
      // Validation: just invalidate query to refresh list
      queryClient.invalidateQueries({ queryKey: ['admin-feature-flags'] });
    };
    window.addEventListener('feature-flag-updated', handleUpdate);
    return () => window.removeEventListener('feature-flag-updated', handleUpdate);
  }, [queryClient]);

  if (isLoading) return <div>{t('featureFlagsAdmin.loading')}</div>;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('featureFlagsAdmin.title')}</h1>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {t('featureFlagsAdmin.createNewFlag')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Flags List */}
        <div className="md:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('featureFlagsAdmin.table.key')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('featureFlagsAdmin.table.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('featureFlagsAdmin.table.rollout')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('featureFlagsAdmin.table.environment')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('featureFlagsAdmin.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {flags?.map((flag) => (
                <tr
                  key={flag.key}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedFlag === flag.key ? 'bg-blue-50' : ''}`}
                  onClick={() => setSelectedFlag(flag.key)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{flag.key}</div>
                    <div className="text-sm text-gray-500">{flag.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateFlagMutation.mutate({
                          key: flag.key,
                          data: { enabled: !flag.enabled },
                        });
                      }}
                      aria-label={t('featureFlagsAdmin.toggleEnabledAria', { key: flag.key })}
                      title={t('featureFlagsAdmin.toggleEnabledTitle')}
                      className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${flag.enabled ? 'bg-green-600' : 'bg-gray-200'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${flag.enabled ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {t('featureFlagsAdmin.percent', {
                      value: formatNumber(flag.percentage !== undefined ? flag.percentage : 100),
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                      {flag.environment
                        ? t(`featureFlagsAdmin.env.${flag.environment}`)
                        : t('featureFlagsAdmin.env.all')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t('featureFlagsAdmin.confirmDelete'))) {
                          deleteFlagMutation.mutate(flag.key);
                        }
                      }}
                      className="text-red-600 hover:text-red-900"
                    >
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Details / Audit Log Panel */}
        <div className="md:col-span-1 bg-white rounded-lg shadow p-6">
          {selectedFlag ? (
            <div>
              <h2 className="text-xl font-bold mb-4">
                {t('featureFlagsAdmin.detailsTitle', { key: selectedFlag })}
              </h2>

              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">
                  {t('featureFlagsAdmin.configurationTitle')}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('featureFlagsAdmin.rolloutPercentage')}
                    </label>
                    <div className="flex items-center mt-1">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        defaultValue={flags?.find((f) => f.key === selectedFlag)?.percentage ?? 100}
                        onMouseUp={(e) => {
                          updateFlagMutation.mutate({
                            key: selectedFlag,
                            data: { percentage: parseInt((e.target as HTMLInputElement).value) },
                          });
                        }}
                        className="w-full"
                      />
                      <span className="ml-2 text-sm text-gray-600">
                        {t('featureFlagsAdmin.percent', {
                          value: formatNumber(
                            flags?.find((f) => f.key === selectedFlag)?.percentage ?? 100
                          ),
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700">
                        {t('featureFlagsAdmin.automatedRollback')}
                      </label>
                      <button
                        onClick={() => {
                          const flag = flags?.find((f) => f.key === selectedFlag);
                          updateFlagMutation.mutate({
                            key: selectedFlag,
                            data: { auto_rollback: !flag?.auto_rollback },
                          });
                        }}
                        className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${flags?.find((f) => f.key === selectedFlag)?.auto_rollback ? 'bg-indigo-600' : 'bg-gray-200'}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${flags?.find((f) => f.key === selectedFlag)?.auto_rollback ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                      </button>
                    </div>

                    {flags?.find((f) => f.key === selectedFlag)?.auto_rollback && (
                      <div className="mt-4 space-y-3 bg-gray-50 p-3 rounded-md">
                        <div>
                          <label className="block text-xs font-medium text-gray-500">
                            {t('featureFlagsAdmin.rollback.errorRateThreshold')}
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            defaultValue={
                              (flags?.find((f) => f.key === selectedFlag)?.rollback?.threshold ??
                                0.01) * 100
                            }
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value) / 100;
                              const currentFlag = flags?.find((f) => f.key === selectedFlag);
                              updateFlagMutation.mutate({
                                key: selectedFlag,
                                data: {
                                  rollback: {
                                    ...(currentFlag?.rollback || {
                                      metric_type: 'error_rate',
                                      min_sample_size: 100,
                                      window_seconds: 60,
                                    }),
                                    threshold: val,
                                  },
                                },
                              });
                            }}
                            className="mt-1 block w-full text-sm border-gray-300 rounded-md p-1"
                          />
                        </div>
                        <div className="flex space-x-2">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500">
                              {t('featureFlagsAdmin.rollback.minSamples')}
                            </label>
                            <input
                              type="number"
                              defaultValue={
                                flags?.find((f) => f.key === selectedFlag)?.rollback
                                  ?.min_sample_size ?? 100
                              }
                              onBlur={(e) => {
                                const val = parseInt(e.target.value);
                                const currentFlag = flags?.find((f) => f.key === selectedFlag);
                                updateFlagMutation.mutate({
                                  key: selectedFlag,
                                  data: {
                                    rollback: {
                                      ...(currentFlag?.rollback || {
                                        metric_type: 'error_rate',
                                        threshold: 0.01,
                                        window_seconds: 60,
                                      }),
                                      min_sample_size: val,
                                    },
                                  },
                                });
                              }}
                              className="mt-1 block w-full text-sm border-gray-300 rounded-md p-1"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500">
                              {t('featureFlagsAdmin.rollback.windowSeconds')}
                            </label>
                            <input
                              type="number"
                              defaultValue={
                                flags?.find((f) => f.key === selectedFlag)?.rollback
                                  ?.window_seconds ?? 60
                              }
                              onBlur={(e) => {
                                const val = parseInt(e.target.value);
                                const currentFlag = flags?.find((f) => f.key === selectedFlag);
                                updateFlagMutation.mutate({
                                  key: selectedFlag,
                                  data: {
                                    rollback: {
                                      ...(currentFlag?.rollback || {
                                        metric_type: 'error_rate',
                                        threshold: 0.01,
                                        min_sample_size: 100,
                                      }),
                                      window_seconds: val,
                                    },
                                  },
                                });
                              }}
                              className="mt-1 block w-full text-sm border-gray-300 rounded-md p-1"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">{t('featureFlagsAdmin.auditLogTitle')}</h3>
                <div className="flow-root">
                  <ul className="-mb-8">
                    {auditLog?.map((log: FeatureFlagAudit, idx: number) => (
                      <li key={log.id}>
                        <div className="relative pb-8">
                          {idx !== auditLog.length - 1 && (
                            <span
                              className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                              aria-hidden="true"
                            ></span>
                          )}
                          <div className="relative flex space-x-3">
                            <div>
                              <span className="h-8 w-8 rounded-full bg-gray-400 flex items-center justify-center ring-8 ring-white">
                                {/* Icon based on type */}
                                <span className="text-xs text-white">
                                  {log.change_type === 'created'
                                    ? 'N'
                                    : log.change_type === 'enabled'
                                      ? 'E'
                                      : 'U'}
                                </span>
                              </span>
                            </div>
                            <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                              <div>
                                <p className="text-sm text-gray-500">
                                  {t('featureFlagsAdmin.auditEntry', {
                                    changeType: log.change_type,
                                    user: log.changed_by,
                                  })}
                                </p>
                              </div>
                              <div className="text-right text-sm whitespace-nowrap text-gray-500">
                                <time dateTime={log.changed_at}>
                                  {formatDate(log.changed_at, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </time>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-10">
              {t('featureFlagsAdmin.selectFlagPrompt')}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
              &#8203;
            </span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  {t('featureFlagsAdmin.createModal.title')}
                </h3>
                <form
                  id="create-flag-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target as HTMLFormElement);
                    createFlagMutation.mutate({
                      key: formData.get('key') as string,
                      description: formData.get('description') as string,
                      enabled: false,
                      environment:
                        (formData.get('environment') as CreateFeatureFlagRequest['environment']) ||
                        'all',
                    });
                  }}
                >
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">
                      {t('featureFlagsAdmin.createModal.keyLabel')}
                    </label>
                    <input
                      name="key"
                      required
                      pattern="[a-z0-9_]+"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    />
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">
                      {t('featureFlagsAdmin.createModal.descriptionLabel')}
                    </label>
                    <input
                      name="description"
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    />
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">
                      {t('featureFlagsAdmin.createModal.environmentLabel')}
                    </label>
                    <select
                      name="environment"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    >
                      <option value="all">{t('featureFlagsAdmin.env.all')}</option>
                      <option value="dev">{t('featureFlagsAdmin.env.dev')}</option>
                      <option value="staging">{t('featureFlagsAdmin.env.staging')}</option>
                      <option value="prod">{t('featureFlagsAdmin.env.prod')}</option>
                    </select>
                  </div>
                </form>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  form="create-flag-form"
                  type="submit"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {t('featureFlagsAdmin.createModal.createButton')}
                </button>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
