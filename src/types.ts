export type StopStatus = 'pending' | 'delivered' | 'partial' | 'refused';

export type DeliveryOutcome = Exclude<StopStatus, 'pending'>;

export type Stop = {
  id: string;
  customer: string;
  address: string;
  items: string[];
  total: number;
  status: StopStatus;
};

export type DeliveryProof = {
  photoUri?: string;
  signature?: string;
};

export type DeliveryEvent = {
  id: string;
  stopId: string;
  status: DeliveryOutcome;
  note: string;
  createdAt: string;
  proof?: DeliveryProof;
};
