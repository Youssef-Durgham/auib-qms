import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Employee } from '@/app/lib/models';

export async function GET() {
  await connectDB();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // Today's tickets
  const todayTickets = await Ticket.find({ createdAt: { $gte: todayStart, $lt: todayEnd } });
  const served = todayTickets.filter(t => t.status === 'served' && t.servedAt && t.completedAt);
  const waiting = todayTickets.filter(t => t.status === 'waiting');

  // Avg wait time (createdAt to servedAt)
  let avgWaitTime = 0;
  const withWait = todayTickets.filter(t => t.servedAt);
  if (withWait.length > 0) {
    avgWaitTime = Math.round(withWait.reduce((s, t) => s + (new Date(t.servedAt!).getTime() - new Date(t.createdAt).getTime()), 0) / withWait.length / 60000);
  }

  // Avg serve time
  let avgServeTime = 0;
  if (served.length > 0) {
    avgServeTime = Math.round(served.reduce((s, t) => s + (new Date(t.completedAt!).getTime() - new Date(t.servedAt!).getTime()), 0) / served.length / 60000);
  }

  // Peak hours (tickets created per hour)
  const peakHours: number[] = new Array(24).fill(0);
  todayTickets.forEach(t => {
    const h = new Date(t.createdAt).getHours();
    peakHours[h]++;
  });

  // Tickets per counter
  const counterBreakdown: Record<number, number> = {};
  todayTickets.filter(t => t.counterNumber).forEach(t => {
    counterBreakdown[t.counterNumber!] = (counterBreakdown[t.counterNumber!] || 0) + 1;
  });

  // Last 7 days summary
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekTickets = await Ticket.find({ createdAt: { $gte: weekStart, $lt: todayEnd } });
  const dailyStats: { date: string; total: number; served: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    const dEnd = new Date(d);
    dEnd.setDate(dEnd.getDate() + 1);
    const dayTickets = weekTickets.filter(t => new Date(t.createdAt) >= d && new Date(t.createdAt) < dEnd);
    dailyStats.push({
      date: d.toISOString().split('T')[0],
      total: dayTickets.length,
      served: dayTickets.filter(t => t.status === 'served').length,
    });
  }

  // Employee performance
  const employees = await Employee.find({}, '-password').sort({ ticketsServed: -1 });
  const employeeStats = employees.map(e => ({
    name: e.name,
    counterNumber: e.counterNumber,
    ticketsServed: e.ticketsServed || 0,
    avgServeTime: e.ticketsServed && e.totalServeTime ? Math.round(e.totalServeTime / e.ticketsServed / 60000) : 0,
  }));

  return NextResponse.json({
    today: {
      total: todayTickets.length,
      served: served.length,
      waiting: waiting.length,
      cancelled: todayTickets.filter(t => t.status === 'cancelled').length,
      avgWaitTime,
      avgServeTime,
      peakHours,
      counterBreakdown,
    },
    week: dailyStats,
    employeeStats,
  });
}
