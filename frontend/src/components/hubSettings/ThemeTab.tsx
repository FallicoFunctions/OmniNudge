import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { hubSettingsService } from '../../services/hubSettingsService';
import { useFormat } from '../../hooks/useFormat';

interface Props {
  hubName: string;
}

export default function ThemeTab({ hubName }: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const [themeName, setThemeName] = useState('');
  const [themeDescription, setThemeDescription] = useState('');
  const [cssContent, setCssContent] = useState('');
  const [applyToWholePage, setApplyToWholePage] = useState(true);
  const [applyToHeader, setApplyToHeader] = useState(false);
  const [applyToSidebar, setApplyToSidebar] = useState(false);
  const [applyToPostList, setApplyToPostList] = useState(false);
  const [applyToPostDetail, setApplyToPostDetail] = useState(false);
  const [previewCSS, setPreviewCSS] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Fetch active theme
  const { data: activeTheme } = useQuery({
    queryKey: ['hubActiveTheme', hubName],
    queryFn: () => hubSettingsService.getActiveTheme(hubName),
    retry: false,
  });

  // Fetch all themes
  const { data: themesData } = useQuery({
    queryKey: ['hubThemes', hubName],
    queryFn: () => hubSettingsService.getAllThemes(hubName),
  });

  // Create theme mutation
  const createMutation = useMutation({
    mutationFn: () =>
      hubSettingsService.createTheme(hubName, {
        name: themeName,
        description: themeDescription || undefined,
        is_active: true,
        css_content: cssContent || undefined,
        apply_to_whole_page: applyToWholePage,
        apply_to_header: applyToHeader,
        apply_to_sidebar: applyToSidebar,
        apply_to_post_list: applyToPostList,
        apply_to_post_detail: applyToPostDetail,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubThemes', hubName] });
      queryClient.invalidateQueries({ queryKey: ['hubActiveTheme', hubName] });
      setThemeName('');
      setThemeDescription('');
      setCssContent('');
      setApplyToWholePage(true);
      setApplyToHeader(false);
      setApplyToSidebar(false);
      setApplyToPostList(false);
      setApplyToPostDetail(false);
    },
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: () =>
      hubSettingsService.previewTheme(hubName, {
        css_content: cssContent,
        apply_to_whole_page: applyToWholePage,
        apply_to_header: applyToHeader,
        apply_to_sidebar: applyToSidebar,
        apply_to_post_list: applyToPostList,
        apply_to_post_detail: applyToPostDetail,
      }),
    onSuccess: (data) => {
      setPreviewCSS(data.scoped_css);
      setShowPreview(true);
    },
  });

  // Activate theme mutation
  const activateMutation = useMutation({
    mutationFn: (themeId: number) => hubSettingsService.activateTheme(hubName, themeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubThemes', hubName] });
      queryClient.invalidateQueries({ queryKey: ['hubActiveTheme', hubName] });
    },
  });

  // Delete theme mutation
  const deleteMutation = useMutation({
    mutationFn: (themeId: number) => hubSettingsService.deleteTheme(hubName, themeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubThemes', hubName] });
    },
  });

  const themes = themesData?.themes || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
          {t('hubSettings.theme.title')}
        </h2>
        <p className="text-[var(--color-text-secondary)]">
          {t('hubSettings.theme.subtitle')}
        </p>
      </div>

      {/* Active Theme Info */}
      {activeTheme && (
        <div className="bg-green-50 border border-green-200 rounded p-4">
          <h3 className="font-medium text-green-900 mb-1">{t('hubSettings.theme.activeTheme.title')}</h3>
          <p className="text-sm text-green-800">{activeTheme.name}</p>
          {activeTheme.description && (
            <p className="text-xs text-green-700 mt-1">{activeTheme.description}</p>
          )}
        </div>
      )}

      {/* Create New Theme */}
      <div className="border border-[var(--color-border)] rounded p-4">
        <h3 className="font-medium text-[var(--color-text-primary)] mb-4">
          {t('hubSettings.theme.create.title')}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              {t('hubSettings.theme.create.fields.name.label')}
            </label>
            <input
              type="text"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              placeholder={t('hubSettings.theme.create.fields.name.placeholder')}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              {t('hubSettings.theme.create.fields.description.label')}
            </label>
            <input
              type="text"
              value={themeDescription}
              onChange={(e) => setThemeDescription(e.target.value)}
              placeholder={t('hubSettings.theme.create.fields.description.placeholder')}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              {t('hubSettings.theme.create.fields.css.label')}
            </label>
            <textarea
              value={cssContent}
              onChange={(e) => setCssContent(e.target.value)}
              placeholder={t('hubSettings.theme.create.fields.css.placeholder')}
              rows={12}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono text-sm"
            />
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              {t('hubSettings.theme.create.fields.css.helper')}
            </p>
          </div>

          {/* Application Scope */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              {t('hubSettings.theme.create.scope.label')}
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={applyToWholePage}
                  onChange={(e) => {
                    setApplyToWholePage(e.target.checked);
                    if (e.target.checked) {
                      setApplyToHeader(false);
                      setApplyToSidebar(false);
                      setApplyToPostList(false);
                      setApplyToPostDetail(false);
                    }
                  }}
                  className="mr-2"
                />
                <span className="text-[var(--color-text-primary)]">{t('hubSettings.theme.create.scope.wholePage')}</span>
              </label>
              {!applyToWholePage && (
                <>
                  <label className="flex items-center ml-6">
                    <input
                      type="checkbox"
                      checked={applyToHeader}
                      onChange={(e) => setApplyToHeader(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-[var(--color-text-primary)]">{t('hubSettings.theme.create.scope.headerOnly')}</span>
                  </label>
                  <label className="flex items-center ml-6">
                    <input
                      type="checkbox"
                      checked={applyToSidebar}
                      onChange={(e) => setApplyToSidebar(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-[var(--color-text-primary)]">{t('hubSettings.theme.create.scope.sidebarOnly')}</span>
                  </label>
                  <label className="flex items-center ml-6">
                    <input
                      type="checkbox"
                      checked={applyToPostList}
                      onChange={(e) => setApplyToPostList(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-[var(--color-text-primary)]">{t('hubSettings.theme.create.scope.postListOnly')}</span>
                  </label>
                  <label className="flex items-center ml-6">
                    <input
                      type="checkbox"
                      checked={applyToPostDetail}
                      onChange={(e) => setApplyToPostDetail(e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-[var(--color-text-primary)]">{t('hubSettings.theme.create.scope.postDetailOnly')}</span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={() => previewMutation.mutate()}
              disabled={!cssContent || previewMutation.isPending}
              className="px-4 py-2 rounded border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-background)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {previewMutation.isPending
                ? t('hubSettings.theme.create.actions.previewing')
                : t('hubSettings.theme.create.actions.previewCss')}
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!themeName || createMutation.isPending}
              className="px-4 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createMutation.isPending
                ? t('hubSettings.theme.create.actions.creating')
                : t('hubSettings.theme.create.actions.createAndActivate')}
            </button>
          </div>

          {createMutation.isError && (
            <p className="text-red-600 text-sm">{t('hubSettings.theme.create.errors.createFailed')}</p>
          )}
          {createMutation.isSuccess && (
            <p className="text-green-600 text-sm">{t('hubSettings.theme.create.success.createdAndActivated')}</p>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-[var(--color-text-primary)]">
                {t('hubSettings.theme.preview.title')}
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                ✕
              </button>
            </div>
            <pre className="bg-[var(--color-background)] p-4 rounded overflow-auto text-xs border border-[var(--color-border)]">
              <code className="text-[var(--color-text-primary)]">{previewCSS}</code>
            </pre>
          </div>
        </div>
      )}

      {/* Theme History */}
      {themes.length > 0 && (
        <div className="border border-[var(--color-border)] rounded overflow-hidden">
          <div className="bg-[var(--color-background)] px-4 py-3 border-b border-[var(--color-border)]">
            <h3 className="font-medium text-[var(--color-text-primary)]">{t('hubSettings.theme.versions.title')}</h3>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {themes.map((theme) => (
              <div key={theme.id} className="px-4 py-3 flex justify-between items-center">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {theme.name}
                    </span>
                    {theme.is_active && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                        {t('hubSettings.theme.versions.active')}
                      </span>
                    )}
                  </div>
                  {theme.description && (
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                      {theme.description}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    {t('hubSettings.theme.versions.versionLine', {
                      version: theme.version,
                      date: formatDate(theme.created_at, { month: 'short', day: 'numeric', year: 'numeric' }),
                    })}
                  </p>
                </div>
                <div className="flex space-x-2">
                  {!theme.is_active && (
                    <>
                      <button
                        onClick={() => activateMutation.mutate(theme.id)}
                        className="px-3 py-1 text-sm rounded border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-background)]"
                      >
                        {t('hubSettings.theme.versions.actions.activate')}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t('hubSettings.theme.versions.confirmDelete'))) {
                            deleteMutation.mutate(theme.id);
                          }
                        }}
                        className="px-3 py-1 text-sm rounded text-red-600 hover:bg-red-50"
                      >
                        {t('common.delete')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
