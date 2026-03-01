import {useState} from 'react';
import {useChannels, useCreateChannel,} from '@/api/hooks/useNotifications.ts';
import ChannelForm from '../../components/notifications/ChannelFormModal';
import {Toast} from '../../components/ui/Toast';
import {useToast} from '@/hooks/useToast.ts';
import type {ChannelType} from '@sectorama/shared';
import {ChannelRow} from "@/pages/Notifications/ChannelRow.tsx";
import {PushNotificationsCard} from "@/pages/Notifications/PushNotificationsCard.tsx";

export default function NotificationsPage() {
    const {data: channels, isLoading} = useChannels();
    const createChannel = useCreateChannel();
    const [adding, setAdding] = useState(false);
    const {toast, showToast, dismissToast} = useToast();

    return <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {toast && <Toast msg={toast} onDismiss={dismissToast}/>}

            <PushNotificationsCard/>

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Notification Channels</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Alerts fire once on transition — when a condition first occurs, then silent until it clears and
                        re-triggers.
                    </p>
                </div>
                <button
                    onClick={() => setAdding(a => !a)}
                    className={`btn-primary ${adding ? 'opacity-60' : ''}`}
                >
                    {adding ? '✕ Cancel' : '+ Add Channel'}
                </button>
            </div>

            <div className="space-y-3">
                {/* Inline add form — appears at the top of the list */}
                {adding && (
                    <ChannelForm
                        onSave={async (data) => {
                            await createChannel.mutateAsync(data as {
                                name: string;
                                type: ChannelType;
                                config: unknown
                            });
                            setAdding(false);
                        }}
                        onCancel={() => setAdding(false)}
                    />
                )}

                {isLoading ? (
                    <p className="text-gray-500 text-center py-16">Loading…</p>
                ) : !channels || channels.length === 0 ? (
                    !adding && (
                        <div className="card text-center py-16">
                            <p className="text-gray-400 mb-2">No notification channels configured.</p>
                            <p className="text-sm text-gray-600">
                                Add a Webhook or Slack channel to receive alerts when drives report health failures or
                                exceed temperature thresholds.
                            </p>
                        </div>
                    )
                ) : (
                    channels.map(ch => (
                        <ChannelRow key={ch.id} channel={ch} onToast={showToast}/>
                    ))
                )}
            </div>
        </div>
}
