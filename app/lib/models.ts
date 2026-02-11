import mongoose, { Schema, Document } from 'mongoose';

export interface ITicket extends Document {
  number: number;
  status: 'waiting' | 'serving' | 'served' | 'cancelled';
  counterNumber: number | null;
  createdAt: Date;
  servedAt: Date | null;
  completedAt: Date | null;
}

const TicketSchema = new Schema<ITicket>({
  number: { type: Number, required: true },
  status: { type: String, enum: ['waiting', 'serving', 'served', 'cancelled'], default: 'waiting' },
  counterNumber: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now },
  servedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
});

export interface ICounter extends Document {
  number: number;
  employeeName: string;
  currentTicket: number | null;
  status: 'open' | 'closed';
}

const CounterSchema = new Schema<ICounter>({
  number: { type: Number, required: true, unique: true },
  employeeName: { type: String, default: '' },
  currentTicket: { type: Number, default: null },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
});

export const Ticket = mongoose.models.Ticket || mongoose.model<ITicket>('Ticket', TicketSchema);
export const Counter = mongoose.models.Counter || mongoose.model<ICounter>('Counter', CounterSchema);
