async function run() {
    try {
        // Fetch public employees to get Lowca Motyli ID
        const empRes = await fetch('http://localhost:3000/api/public/employees', {
            headers: {
                'X-Salon-Id': 'lowca-motyli',
                'X-API-Key': 'simpli-salon-test-key-2024' // Assuming or we bypass if localhost has dev DB? 
                // Wait, I can directly use PostgREST via Supabase Admin...
                // Or I can use local fetch to route.ts
            }
        });
        const empData = await empRes.json();
        console.log("Emp:", empData);

        const servRes = await fetch('http://localhost:3000/api/public/services', {
            headers: {
                'X-Salon-Id': 'lowca-motyli'
            }
        })
        const servData = await servRes.json();
        console.log("Serv:", servData);

        if (empData.employees && servData.services) {
            const lowca = empData.employees.find((e: any) => e.name === 'Lowca Motyli');
            const serv = servData.services[0];
            if (lowca && serv) {
                const availUrl = `http://localhost:3000/api/public/availability/dates?startDate=2026-03-01&endDate=2026-03-31&serviceId=${serv.id}&employeeId=${lowca.id}`;
                console.log(availUrl);
                const availRes = await fetch(availUrl, {
                    headers: { 'X-Salon-Id': 'lowca-motyli' }
                });
                const availData = await availRes.json();
                console.log("Avail:", availData);
            }
        }
    } catch (e) {
        console.error(e);
    }
}
run();
