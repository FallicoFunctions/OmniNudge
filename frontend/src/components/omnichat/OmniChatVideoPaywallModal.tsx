import { Film, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';

export default function OmniChatVideoPaywallModal({ isOpen, feature, onClose, onViewOptions }: { isOpen: boolean; feature: 'scene_video' | 'video_call'; onClose: () => void; onViewOptions: () => void }) {
  const { t } = useTranslation();
  const label = t(`omnichat.videoPaywall.features.${feature}`);
  return <Modal isOpen={isOpen} onClose={onClose} ariaLabelledBy="omnichat-video-paywall-title" ariaDescribedBy="omnichat-video-paywall-description" overlayClassName="bg-black/80 backdrop-blur-md" className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#11131b] p-6 text-white shadow-2xl" animation="quick-chat"><div className="flex justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300"><Film/></div><button type="button" aria-label={t('common.close')} onClick={onClose} className="rounded-full p-2 text-white/55 hover:bg-white/10"><X size={20}/></button></div><h2 id="omnichat-video-paywall-title" className="mt-5 text-2xl font-semibold">{t('omnichat.videoPaywall.title', { feature: label })}</h2><p id="omnichat-video-paywall-description" className="mt-2 text-sm leading-6 text-white/55">{t('omnichat.videoPaywall.description')}</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-white/60">{t('common.cancel')}</button><button type="button" onClick={onViewOptions} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold">{t('omnichat.videoPaywall.viewOptions')}</button></div></Modal>;
}
