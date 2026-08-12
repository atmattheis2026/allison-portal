import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ClientView from './pages/ClientView'
import ClientLeadView from './pages/ClientLeadView'
import AdminTransaction from './pages/AdminTransaction'
import AdminList from './pages/AdminList'
import AdminLeads from './pages/AdminLeads'
import AdminLead from './pages/AdminLead'
import AdminClosed from './pages/AdminClosed'
import AdminRolodex from './pages/AdminRolodex'
import AdminSettings from './pages/AdminSettings'
import AdminNetworkLeads from './pages/AdminNetworkLeads'
import NetworkAgentDetail from './components/NetworkAgentDetail'
import MentorHome from './pages/MentorHome'
import Login from './pages/Login'
import './theme.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* What clients open. The token is the whole credential. */}
        <Route path="/t/:token" element={<ClientView />} />
        <Route path="/l/:token" element={<ClientLeadView />} />

        {/* Allison's side. */}
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminList />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/t/:id" element={<AdminTransaction />} />
        <Route path="/admin/leads" element={<AdminLeads />} />
        <Route path="/admin/leads/:id" element={<AdminLead />} />
        <Route path="/admin/closed" element={<AdminClosed />} />
        <Route path="/admin/rolodex" element={<AdminRolodex />} />
        <Route path="/admin/network" element={<AdminNetworkLeads />} />
        <Route path="/admin/network/:id" element={<NetworkAgentDetail viewer="staff" />} />

        {/* A mentor's own two pages — see migration 064 for why they're
            walled off from everything above. */}
        <Route path="/mentor" element={<MentorHome />} />
        <Route path="/mentor/:id" element={<NetworkAgentDetail viewer="mentor" />} />

        {/* No marketing homepage — land on the admin list. */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
