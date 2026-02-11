import mongoose, { Schema, Document } from 'mongoose';

export interface ITicket extends Document {
  number: number;
  status: 'waiting' | 'serving' | 'served' | 'cancelled';
  counterNumber: number | null;
  category: string;
  createdAt: Date;
  servedAt: Date | null;
  completedAt: Date | null;
  recallCount: number;
  cancelReason: string | null;
}

const TicketSchema = new Schema<ITicket>({
  number: { type: Number, required: true },
  status: { type: String, enum: ['waiting', 'serving', 'served', 'cancelled'], default: 'waiting' },
  counterNumber: { type: Number, default: null },
  category: { type: String, default: 'General Inquiry' },
  createdAt: { type: Date, default: Date.now },
  servedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  recallCount: { type: Number, default: 0 },
  cancelReason: { type: String, default: null },
});

export interface ICounter extends Document {
  number: number;
  employeeName: string;
  currentTicket: number | null;
  status: 'open' | 'closed';
  categories: string[];
}

const CounterSchema = new Schema<ICounter>({
  number: { type: Number, required: true, unique: true },
  employeeName: { type: String, default: '' },
  currentTicket: { type: Number, default: null },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  categories: { type: [String], default: [] },
});

export interface IEmployee extends Document {
  username: string;
  password: string;
  name: string;
  counterNumber: number;
  role: 'employee' | 'admin';
  active: boolean;
  categories: string[];
  ticketsServed: number;
  totalServeTime: number;
}

const EmployeeSchema = new Schema<IEmployee>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  counterNumber: { type: Number, required: true, unique: true },
  role: { type: String, enum: ['employee', 'admin'], default: 'employee' },
  active: { type: Boolean, default: true },
  categories: { type: [String], default: [] },
  ticketsServed: { type: Number, default: 0 },
  totalServeTime: { type: Number, default: 0 },
});

export interface ISession extends Document {
  token: string;
  employeeId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const SessionSchema = new Schema<ISession>({
  token: { type: String, required: true, unique: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 },
});

export interface ISettings extends Document {
  key: string;
  value: string;
}

const SettingsSchema = new Schema<ISettings>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
});

export const Ticket = mongoose.models.Ticket || mongoose.model<ITicket>('Ticket', TicketSchema);
export const Counter = mongoose.models.Counter || mongoose.model<ICounter>('Counter', CounterSchema);
export const Employee = mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema);
export const Session = mongoose.models.Session || mongoose.model<ISession>('Session', SessionSchema);
export const Settings = mongoose.models.Settings || mongoose.model<ISettings>('Settings', SettingsSchema);
