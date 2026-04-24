
"use client"

export default function MitgliedRegistrierenPage() {
	return (
		<div className="min-h-screen bg-gray-50 flex justify-center">
			<div className="w-full max-w-md px-4 py-8 space-y-6 mx-auto">
				{/* Header */}
				<div className="space-y-1">
					<h1 className="text-3xl font-bold text-gray-900">Boxtraining starten</h1>
					<p className="text-gray-500">In unter 60 Sekunden fertig</p>
				</div>
				{/* Card */}
				<div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
					{/* Name */}
					<div className="grid grid-cols-2 gap-2">
						<input className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500" placeholder="Vorname" />
						<input className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500" placeholder="Nachname" />
					</div>
					{/* Geburtsdatum */}
					<input type="date" className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500" />
					{/* Geschlecht */}
					<div className="grid grid-cols-2 gap-2">
						<button className="px-4 py-2 rounded-xl border border-gray-200">👦 Männlich</button>
						<button className="px-4 py-2 rounded-xl border border-gray-200">👧 Weiblich</button>
					</div>
					{/* Gruppe */}
					<div className="grid grid-cols-2 gap-2">
						<button className="px-4 py-2 rounded-xl border border-gray-200">10–14</button>
						<button className="px-4 py-2 rounded-xl border border-gray-200">15–18</button>
						<button className="px-4 py-2 rounded-xl border border-gray-200">Ü18</button>
						<button className="px-4 py-2 rounded-xl border border-gray-200">L-Gruppe</button>
					</div>
					{/* Kontakt */}
					<input className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500" placeholder="E-Mail" />
					<input type="password" className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500" placeholder="Passwort" />
					{/* Datenschutz */}
					<label className="flex items-center gap-2 text-sm text-gray-600">
						<input type="checkbox" />
						Datenschutz akzeptieren
					</label>
					{/* CTA Button */}
					<button className="w-full h-14 bg-blue-600 text-white rounded-xl font-semibold shadow-md hover:bg-blue-700">Jetzt starten</button>
				</div>
				{/* Trust */}
				<p className="text-xs text-gray-400 text-center">Kostenlos • Kein Vertrag • Jederzeit kündbar</p>
			</div>
		</div>
	)
}
