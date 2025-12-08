const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");   // 🔥 Added (required for ObjectId)
const Agent = require("../models/Agent");
const Customer = require("../models/Customer");

/* ============================
      LOGIN
=============================== */
router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const agent = await Agent.findOne({ username, password });
    if (!agent) return res.status(401).send({ error: "Invalid credentials" });

    agent.online = true;
    await agent.save();

    res.send({
        success: true,
        agentId: agent._id,
        username: agent.username
    });
});

/* ============================
      LOGOUT
=============================== */
router.post("/logout", async (req, res) => {
    const { agentId } = req.body;

    await Agent.findByIdAndUpdate(agentId, { online: false });
    res.send({ success: true });
});

/* ============================================================
   SMART FUNCTION: GET NEXT AGENT (ROUND ROBIN)
=============================================================== */
async function getNextAgent() {
    const onlineAgents = await Agent.find({ online: true }).sort({ _id: 1 });
    let agentPool = onlineAgents;

    if (agentPool.length === 0) {
        agentPool = await Agent.find({}).sort({ _id: 1 });
    }

    if (agentPool.length === 0) return null;

    const lastCustomer = await Customer.findOne({}).sort({ assignedAt: -1 });
    if (!lastCustomer) return agentPool[0]._id;

    const lastAssignedAgentId = lastCustomer.assignedTo.toString();
    const index = agentPool.findIndex(a => a._id.toString() === lastAssignedAgentId);

    if (index === -1) return agentPool[0]._id;

    const nextIndex = (index + 1) % agentPool.length;
    return agentPool[nextIndex]._id;
}

/* ============================================================
   ASSIGN CUSTOMER (used by webhook)
=============================================================== */
router.post("/assign-customer", async (req, res) => {
    try {
        const { phone } = req.body;

        let customer = await Customer.findOne({ phone });

        if (!customer) {
            const assignedTo = await getNextAgent();

            customer = await Customer.create({
                phone,
                assignedTo,
                assignedAt: new Date()
            });
        }

        res.send({ success: true, assignedTo: customer.assignedTo });

    } catch (err) {
        console.log("❌ assign-customer Error:", err);
        res.status(500).send({ error: "Server error" });
    }
});

/* ============================================================
   RETURN CUSTOMERS FOR LOGGED-IN AGENT
=============================================================== */
router.get("/customers", async (req, res) => {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).send({ error: "agentId required" });

    try {
        const customers = await Customer
            .find({ assignedTo: new mongoose.Types.ObjectId(agentId) }) // 🔥 FIXED
            .sort({ assignedAt: -1 });

        res.send(customers);

    } catch (err) {
        res.status(500).send({ error: "Invalid agentId format" });
    }
});

module.exports = router;
