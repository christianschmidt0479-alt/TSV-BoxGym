"use client"

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck,
  Users,
  UserPlus,
  QrCode,
  ScanLine,
  CalendarDays,
  ClipboardList,
  Download,
  CheckCircle2,
  Clock3,
  Smartphone,
  LogIn,
  UserCheck,
  Settings,
} from "lucide-react";

const brand = {
  primary: "bg-[#154c83]",
  primaryText: "text-[#154c83]",
  accent: "bg-[#e6332a]",
  accentText: "text-[#e6332a]",
  dark: "bg-zinc-950",
  light: "bg-zinc-50",
};

const groupOptions = [
  "Boxzwerge",
  "Basic 10-14 Jahre",
  "Basic 15-18 Jahre",
  "Basic ab 18 Jahre",
  "L-Gruppe",
  "Bereich SV",
  "Probemitglied",
];

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function timeString() {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function downloadFile(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TSVBoxGymCheckinApp() {

  const [members, setMembers] = useState<any[]>([])
  const [attendanceLog, setAttendanceLog] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [scanInput, setScanInput] = useState("")
  const [fullName, setFullName] = useState("")
  const [memberGroup, setMemberGroup] = useState("Basic 10-14 Jahre")
  const [memberType, setMemberType] = useState("Mitglied")
  const [trainerName, setTrainerName] = useState("Christian Schmidt")
  const [trainerPin, setTrainerPin] = useState("2026")
  const [pinInput, setPinInput] = useState("")
  const [trainerMode, setTrainerMode] = useState(false)

  useEffect(()=>{
    const savedMembers = localStorage.getItem("tsv-boxgym-members")
    const savedTrainerMode = localStorage.getItem("tsv-boxgym-trainer-mode")

    if(savedMembers){
      setMembers(JSON.parse(savedMembers))
    }

    if(savedTrainerMode === "true"){
      setTrainerMode(true)
    }
  },[])

  useEffect(()=>{
    localStorage.setItem("tsv-boxgym-members", JSON.stringify(members))
  },[members])

  useEffect(()=>{
    localStorage.setItem("tsv-boxgym-trainer-mode", String(trainerMode))
  },[trainerMode])

  const registerParticipation = () => {

    const name = fullName.trim()

    if(!name){
      alert("Bitte Namen eingeben")
      return
    }

    const duplicate = attendanceLog.some(
      (entry)=> entry.date === selectedDate && entry.name === name
    )

    if(duplicate){
      alert("Teilnahme bereits erfasst")
      return
    }

    setAttendanceLog((prev)=>[
      {
        id: Date.now(),
        date: selectedDate,
        time: timeString(),
        trainer: trainerName,
        name,
        memberType,
        memberGroup
      },
      ...prev
    ])

    setFullName("")
  }

  const exportCsv = () => {

    const rows = [
      ["Datum","Uhrzeit","Name","Typ","Gruppe","Trainer"],
      ...attendanceLog.map((a)=>[
        a.date,
        a.time,
        a.name,
        a.memberType,
        a.memberGroup,
        a.trainer
      ])
    ]

    const csv = rows.map(r=>r.join(",")).join("\n")

    downloadFile(`tsv-anwesenheit-${selectedDate}.csv`, csv, "text/csv;charset=utf-8")

  }

  const handleTrainerLogin = ()=>{
    if(pinInput === trainerPin){
      setTrainerMode(true)
      setPinInput("")
      return
    }

    alert("PIN falsch")
  }

  return (

    <div className="min-h-screen bg-zinc-50 p-6">

      <div className="max-w-6xl mx-auto space-y-6">

        <h1 className="text-3xl font-bold">
          TSV BoxGym Check-in
        </h1>

        <Card>
          <CardHeader>
            <CardTitle>Teilnahme bestätigen</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">

            <div>
              <Label>Name</Label>
              <Input
                value={fullName}
                onChange={(e)=>setFullName(e.target.value)}
              />
            </div>

            <div>
              <Label>Typ</Label>

              <Select
                value={memberType}
                onValueChange={setMemberType}
              >
                <SelectTrigger>
                  <SelectValue/>
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="Mitglied">Mitglied</SelectItem>
                  <SelectItem value="Probemitglied">Probemitglied</SelectItem>
                </SelectContent>

              </Select>
            </div>

            <div>
              <Label>Gruppe</Label>

              <Select
                value={memberGroup}
                onValueChange={setMemberGroup}
              >
                <SelectTrigger>
                  <SelectValue/>
                </SelectTrigger>

                <SelectContent>
                  {groupOptions.map(g=>(
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>

              </Select>

            </div>

            <Button
              onClick={registerParticipation}
              className="bg-[#154c83] text-white"
            >
              Teilnahme bestätigen
            </Button>

          </CardContent>

        </Card>

        <Card>

          <CardHeader>
            <CardTitle>Trainer Login</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">

            <Input
              type="password"
              placeholder="Trainer PIN"
              value={pinInput}
              onChange={(e)=>setPinInput(e.target.value)}
            />

            <Button
              onClick={handleTrainerLogin}
            >
              Login
            </Button>

          </CardContent>

        </Card>

        {trainerMode && (

          <Card>

            <CardHeader>
              <CardTitle>Anwesenheitsliste</CardTitle>
            </CardHeader>

            <CardContent>

              <Table>

                <TableHeader>
                  <TableRow>
                    <TableHead>Uhrzeit</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Gruppe</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>

                  {attendanceLog.map((entry)=>(
                    <TableRow key={entry.id}>
                      <TableCell>{entry.time}</TableCell>
                      <TableCell>{entry.name}</TableCell>
                      <TableCell>{entry.memberType}</TableCell>
                      <TableCell>{entry.memberGroup}</TableCell>
                    </TableRow>
                  ))}

                </TableBody>

              </Table>

              <div className="mt-4">

                <Button onClick={exportCsv}>
                  CSV Export
                </Button>

              </div>

            </CardContent>

          </Card>

        )}

      </div>

    </div>

  )
}