-- Run this SQL in your Supabase SQL Editor (supabase.com → SQL Editor → New Query)
-- STEP 1: Create all tables first

create table profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null unique,
  avatar_url text,
  created_at timestamp with time zone default now()
);

create table friendships (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  friend_id uuid references profiles(id) on delete cascade,
  status text default 'accepted',
  created_at timestamp with time zone default now()
);

create table groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamp with time zone default now()
);

create table group_members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamp with time zone default now()
);

create table expenses (
  id uuid default gen_random_uuid() primary key,
  description text not null,
  amount numeric(10,2) not null,
  currency text default 'USD',
  paid_by uuid references profiles(id),
  group_id uuid references groups(id) on delete cascade,
  category text default 'Other',
  date timestamp with time zone default now(),
  receipt_url text,
  created_at timestamp with time zone default now()
);

create table expense_splits (
  id uuid default gen_random_uuid() primary key,
  expense_id uuid references expenses(id) on delete cascade,
  user_id uuid references profiles(id),
  amount numeric(10,2) not null,
  is_settled boolean default false,
  created_at timestamp with time zone default now()
);

create table payments (
  id uuid default gen_random_uuid() primary key,
  from_user_id uuid references profiles(id),
  to_user_id uuid references profiles(id),
  amount numeric(10,2) not null,
  group_id uuid references groups(id),
  note text,
  created_at timestamp with time zone default now()
);

-- STEP 2: Enable Row Level Security on all tables

alter table profiles enable row level security;
alter table friendships enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table payments enable row level security;

-- STEP 3: Add all policies (now all tables exist)

-- Profiles
create policy "Users can view all profiles" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Friendships
create policy "Users can manage their friendships" on friendships for all using (auth.uid() = user_id or auth.uid() = friend_id);

-- Groups
create policy "Group members can view groups" on groups for select using (
  exists (select 1 from group_members where group_id = groups.id and user_id = auth.uid())
);
create policy "Authenticated users can create groups" on groups for insert with check (auth.uid() = created_by);

-- Group Members
create policy "Group members can view membership" on group_members for select using (
  user_id = auth.uid() or
  exists (select 1 from group_members gm where gm.group_id = group_members.group_id and gm.user_id = auth.uid())
);
create policy "Users can join groups" on group_members for insert with check (true);

-- Expenses
create policy "Users can view expenses in their groups" on expenses for select using (
  exists (select 1 from group_members where group_id = expenses.group_id and user_id = auth.uid())
  or paid_by = auth.uid()
);
create policy "Authenticated users can insert expenses" on expenses for insert with check (auth.uid() = paid_by);

-- Expense Splits
create policy "Users can view their splits" on expense_splits for select using (
  user_id = auth.uid() or
  exists (select 1 from expenses e join group_members gm on gm.group_id = e.group_id where e.id = expense_splits.expense_id and gm.user_id = auth.uid())
);
create policy "Authenticated users can insert splits" on expense_splits for insert with check (true);
create policy "Users can update their own splits" on expense_splits for update using (user_id = auth.uid());

-- Payments
create policy "Users can view their payments" on payments for select using (
  from_user_id = auth.uid() or to_user_id = auth.uid()
);
create policy "Users can insert payments" on payments for insert with check (auth.uid() = from_user_id);
