import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import App from '../App';
import { EVENTS_KEY } from '../src/storage';
import type { DeliveryEvent } from '../src/types';

const CUSTOMERS = ['La Plăcinte Centru', 'Andy’s Pizza Botanica', 'Coffee Break'];
const NOTE_PLACEHOLDER = 'Ex: lipsesc 2 baxuri de apă';
const OUTCOME_BUTTONS = {
  delivered: 'Livrat integral',
  partial: 'Livrat parțial',
  refused: 'Refuzat',
} as const;

type User = ReturnType<typeof userEvent.setup>;

async function storedEvents(): Promise<DeliveryEvent[]> {
  return JSON.parse((await AsyncStorage.getItem(EVENTS_KEY)) ?? '[]') as DeliveryEvent[];
}

/**
 * Drives the whole confirmation flow for one stop. When the detail screen gains
 * extra required steps (e.g. photo or signature proof), add them here.
 */
async function confirmStop(user: User, customer: string, outcome: keyof typeof OUTCOME_BUTTONS, note = '') {
  await user.press(screen.getByText(customer));
  expect(await screen.findByText('Confirmă livrarea')).toBeOnTheScreen();
  if (note) await user.type(screen.getByPlaceholderText(NOTE_PLACEHOLDER), note);
  await user.press(screen.getByText(OUTCOME_BUTTONS[outcome]));
  expect(await screen.findByText('Ruta de azi')).toBeOnTheScreen();
}

let user: User;

beforeEach(async () => {
  // The detail screen runs a 100 ms timer; fake timers keep it deterministic.
  jest.useFakeTimers();
  user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('App', () => {
  it('renders the route of the day with three pending stops', async () => {
    await render(<App />);

    expect(screen.getByText('Livrările zilei')).toBeOnTheScreen();
    expect(screen.getByText('Ruta de azi')).toBeOnTheScreen();
    for (const customer of CUSTOMERS) {
      expect(screen.getByText(customer)).toBeOnTheScreen();
    }
    expect(screen.getAllByText('De livrat')).toHaveLength(3);
    expect(screen.getByText('0/3')).toBeOnTheScreen();
    expect(screen.getByText('Offline-first')).toBeOnTheScreen();
  });

  it('shows the order details when a stop is opened and returns with the back button', async () => {
    await render(<App />);

    await user.press(screen.getByText('Coffee Break'));

    expect(screen.getByText('Str. București 33')).toBeOnTheScreen();
    expect(screen.getByText('Comanda 716 MDL')).toBeOnTheScreen();
    expect(screen.getByText('• Cafea boabe 1kg × 3')).toBeOnTheScreen();
    expect(screen.queryByText('La Plăcinte Centru')).not.toBeOnTheScreen();

    await user.press(screen.getByText('‹ Ruta de azi'));

    expect(screen.getByText('La Plăcinte Centru')).toBeOnTheScreen();
    expect(screen.getAllByText('De livrat')).toHaveLength(3);
  });

  it('confirms a delivery offline: status, counter and AsyncStorage are updated', async () => {
    await render(<App />);

    await confirmStop(user, 'La Plăcinte Centru', 'delivered', '  Lăsat la bar  ');

    expect(screen.getByText('Livrat')).toBeOnTheScreen();
    expect(screen.getAllByText('De livrat')).toHaveLength(2);
    expect(screen.getByText('✓')).toBeOnTheScreen();
    expect(screen.getByText('1/3')).toBeOnTheScreen();
    expect(screen.getByText('1 offline')).toBeOnTheScreen();
    expect(Alert.alert).toHaveBeenCalledWith('Salvat offline', expect.stringContaining('La Plăcinte Centru: livrare confirmată'));

    const events = await storedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ stopId: 'stop-1', status: 'delivered', note: 'Lăsat la bar' });
    expect(Date.parse(events[0].createdAt)).not.toBeNaN();
  });

  it('keeps one event per stop when a stop is re-confirmed', async () => {
    await render(<App />);

    await confirmStop(user, 'Coffee Break', 'delivered');
    await confirmStop(user, 'Coffee Break', 'refused', 'Închis');

    expect(screen.getByText('Refuzat')).toBeOnTheScreen();
    expect(screen.queryByText('Livrat')).not.toBeOnTheScreen();
    expect(screen.getByText('1 offline')).toBeOnTheScreen();
    expect(await storedEvents()).toEqual([
      expect.objectContaining({ stopId: 'stop-3', status: 'refused', note: 'Închis' }),
    ]);
  });

  it('restores the confirmed stops and the offline queue after a re-mount', async () => {
    const first = await render(<App />);
    await confirmStop(user, 'La Plăcinte Centru', 'delivered');
    await confirmStop(user, 'Andy’s Pizza Botanica', 'partial', 'Lipsesc 2 baxuri');
    await first.unmount();

    await render(<App />);

    expect(await screen.findByText('2 offline')).toBeOnTheScreen();
    expect(screen.getByText('Livrat')).toBeOnTheScreen();
    expect(screen.getByText('Parțial')).toBeOnTheScreen();
    expect(screen.getAllByText('De livrat')).toHaveLength(1);
    expect(screen.getByText('2/3')).toBeOnTheScreen();
  });

  it('starts cleanly when the stored queue is corrupted', async () => {
    await AsyncStorage.setItem(EVENTS_KEY, '{broken');

    await render(<App />);

    expect(screen.getAllByText('De livrat')).toHaveLength(3);
    expect(screen.getByText('Offline-first')).toBeOnTheScreen();
  });
});
