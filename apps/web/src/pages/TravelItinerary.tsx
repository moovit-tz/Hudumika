import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import './Travel.css';

interface Trip { id: string; title: string; destination: string; start_date?: string; end_date?: string; status: string; }
interface ItineraryItem {
  id: string;
  trip_id: string;
  day_number: number;
  sort_order: number;
  item_type: string;
  title: string;
  description?: string;
  location?: string;
  start_time?: string;
  end_time?: string;
  confirmation?: string;
  cost?: number;
  currency?: string;
  status: string;
}

const TYPE_ICONS: Record<string, string> = {
  flight: 'plane', hotel: 'home', transport: 'truck', activity: 'compass',
  restaurant: 'coffee', meeting: 'users', other: 'fileText',
};
const TYPE_VARIANTS: Record<string, 'brand' | 'success' | 'warning' | 'info' | 'gray'> = {
  flight: 'brand', hotel: 'info', transport: 'warning', activity: 'success',
  restaurant: 'warning', meeting: 'gray', other: 'gray',
};

function fmtTime(d?: string) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export const TravelItinerary: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<string>('__none__');
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    apiFetch('/v1/travel/trips').then((res: any) => {
      const list = Array.isArray(res) ? res : [];
      setTrips(list);
      const active = list.find((t: Trip) => t.status === 'active' || t.status === 'upcoming') ?? list[0];
      if (active) setSelectedTrip(active.id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadItems = useCallback(async (tripId: string) => {
    if (!tripId || tripId === '__none__') { setItems([]); return; }
    try {
      const res = await apiFetch(`/v1/travel/trips/${tripId}/itinerary`);
      setItems(Array.isArray(res) ? res : []);
    } catch { setItems([]); }
  }, []);

  useEffect(() => { loadItems(selectedTrip); }, [selectedTrip, loadItems]);

  const grouped = items.reduce<Record<number, ItineraryItem[]>>((acc, item) => {
    (acc[item.day_number] ??= []).push(item);
    return acc;
  }, {});

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/v1/travel/itinerary/${id}`, { method: 'DELETE' });
      showAlert('Item removed.', { variant: 'info' });
      loadItems(selectedTrip);
    } catch { showAlert('Could not remove item.'); }
  };

  if (loading) return <SkeletonPage />;

  return (
    <div className="travel-overview">
      <PageHeader
        crumbs={['Travel', 'Itinerary']}
        titlePlain="Trip"
        titleEm="itinerary"
        subtitle="Day-by-day plan for your trip."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {trips.length > 0 && (
              <Select value={selectedTrip} onValueChange={setSelectedTrip}>
                <SelectTrigger style={{ minWidth: 180 }}><SelectValue placeholder="Select trip" /></SelectTrigger>
                <SelectContent>
                  {trips.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => setShowAdd(true)} disabled={!selectedTrip || selectedTrip === '__none__'}>
              <Icon name="plus" size={14} />
              <span>Add Item</span>
            </Button>
          </div>
        }
      />

      {Object.keys(grouped).length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 24px', textAlign: 'center' }}>
          <FeaturedIcon variant="brand" size="xl" shape="circle">
            <Icon name="calendar" size={28} />
          </FeaturedIcon>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>No itinerary items</h3>
          <p style={{ fontSize: 13.5, color: 'var(--ink3)', margin: 0, maxWidth: 360 }}>
            {trips.length === 0 ? 'Create a trip first, then add your day-by-day plan.' : 'Add flights, hotels, and activities to build your itinerary.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b)).map(([day, dayItems]) => (
            <SectionCard key={day} title={`Day ${day}`} padded={false}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {dayItems.sort((a, b) => a.sort_order - b.sort_order).map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                    <FeaturedIcon variant={TYPE_VARIANTS[item.item_type] ?? 'gray'} size="sm" shape="square">
                      <Icon name={(TYPE_ICONS[item.item_type] ?? 'fileText') as any} size={14} />
                    </FeaturedIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{item.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {item.location && <span><Icon name="mapPin" size={10} /> {item.location}</span>}
                        {item.start_time && <span>{fmtTime(item.start_time)}{item.end_time ? ` - ${fmtTime(item.end_time)}` : ''}</span>}
                        {item.confirmation && <span>Ref: {item.confirmation}</span>}
                      </div>
                    </div>
                    {item.cost != null && (
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font)' }}>
                        {item.currency ?? 'USD'} {Math.round(item.cost).toLocaleString()}
                      </span>
                    )}
                    <Badge variant={item.status === 'confirmed' ? 'success' : item.status === 'cancelled' ? 'error' : 'gray'}>
                      {item.status}
                    </Badge>
                    <Button variant="ghost" size="xs" onClick={() => handleDelete(item.id)}>
                      <Icon name="trash" size={12} style={{ color: 'var(--red)' }} />
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {/* Add Item Dialog */}
      <AddItemDialog open={showAdd} onOpenChange={setShowAdd} tripId={selectedTrip} onCreated={() => loadItems(selectedTrip)} />
    </div>
  );
};

function AddItemDialog({ open, onOpenChange, tripId, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; tripId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [itemType, setItemType] = useState('activity');
  const [dayNumber, setDayNumber] = useState('1');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/travel/itinerary', {
        method: 'POST',
        body: JSON.stringify({
          trip_id: tripId,
          title: title.trim(),
          item_type: itemType,
          day_number: Number(dayNumber) || 1,
          location: location.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      showAlert('Item added.', { variant: 'success' });
      onOpenChange(false);
      setTitle(''); setLocation(''); setDescription(''); setDayNumber('1');
      onCreated();
    } catch (e: any) {
      showAlert(e?.message || 'Could not add item.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Add Itinerary Item</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="tv-form-grid">
            <label className="tv-form-field">
              <span>Title</span>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Visit Belem Tower" autoFocus />
            </label>
            <label className="tv-form-field">
              <span>Type</span>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(TYPE_ICONS).map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="tv-form-field">
              <span>Day number</span>
              <Input type="number" value={dayNumber} onChange={e => setDayNumber(e.target.value)} min={1} />
            </label>
            <label className="tv-form-field">
              <span>Location</span>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Lisbon" />
            </label>
            <label className="tv-form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Description</span>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Adding...' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
