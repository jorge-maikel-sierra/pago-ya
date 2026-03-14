import { Queue } from 'bullmq';
import Decimal from 'decimal.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getDashboardKPIs } from '../services/admin.service.js';
import { generateFixedDailySchedule } from '../engine/amortization.js';
import * as apiResponse from '../utils/apiResponse.js';
import { createLoanSchema } from '../schemas/loan.schema.js';
import redisClient from '../config/redis.js';
import { QUEUE_NAME } from '../jobs/telegramWorker.js';

// Cola de Telegram solo disponible cuando Redis está configurado
const telegramQueue = redisClient
  ? new Queue(QUEUE_NAME, { connection: redisClient })
  : null;

/**
 * GET /admin/login
 * Renderiza el formulario de inicio de sesión.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getLogin = (req, res) => {
  const { flashError, flashSucess } = req.session;
  delete req.session.flashError;
  delete req.session.flashSucess;

  return res.render('pages/login', {
    title: 'Iniciar Sesión',
    currentPath: '/admin/login',
    flashError,
    flashSucess,
  });
};

/**
 * POST /admin/login
 * Procesa el formulario de login, crea la sesión y redirige al dashboard.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const postLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validación de campos requeridos
  if (!email || !password) {
    req.session.flashError = 'Email y contraseña son requeridos';
    return req.session.save(() => res.redirect('/admin/login'));
  }

  const { default: prisma } = await import('../config/prisma.js');
  const { default: bcrypt } = await import('bcrypt');

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      organizationId: true,
      role: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
      passwordHash: true,
    },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    req.session.flashError = 'Credenciales inválidas';
    return req.session.save(() => res.redirect('/admin/login'));
  }

  if (!user.isActive) {
    req.session.flashError = 'Cuenta desactivada. Contacte al administrador';
    return req.session.save(() => res.redirect('/admin/login'));
  }

  const allowedRoles = ['SUPER_ADMIN', 'ADMIN'];
  if (!allowedRoles.includes(user.role)) {
    req.session.flashError = 'Acceso denegado. Solo administradores';
    return req.session.save(() => res.redirect('/admin/login'));
  }

  const { passwordHash: _, ...sessionUser } = user;
  req.session.user = sessionUser;

  // Esperar a que la sesión se persista antes de redirigir para que la
  // cookie se envíe correctamente detrás del proxy de Fly.io
  return req.session.save(() => res.redirect('/admin/dashboard'));
});

/**
 * GET /admin/dashboard
 * Consulta los KPIs de la organización y renderiza el dashboard.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getDashboard = asyncHandler(async (req, res) => {
  const kpis = await getDashboardKPIs(req.user.organizationId);

  return res.render('pages/dashboard', {
    title: 'Dashboard',
    user: req.user,
    kpis,
    currentPath: '/admin/dashboard',
  });
});

/**
 * GET /admin/loans
 * Lista los préstamos de la organización con filtros opcionales.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getLoans = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  const { search, status } = req.query;

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  /** @type {import('@prisma/client').Prisma.LoanWhereInput} */
  const where = {
    organizationId: req.user.organizationId,
  };

  if (status && status.trim() !== '') {
    where.status = status.trim();
  }

  if (search && search.trim() !== '') {
    const term = search.trim();
    where.client = {
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ],
    };
  }

  const loans = await prisma.loan.findMany({
    where,
    orderBy: { disbursementDate: 'desc' },
    select: {
      id: true,
      status: true,
      principalAmount: true,
      totalAmount: true,
      installmentAmount: true,
      outstandingBalance: true,
      numberOfPayments: true,
      paidPayments: true,
      disbursementDate: true,
      paymentFrequency: true,
      client: {
        select: { firstName: true, lastName: true },
      },
      collector: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  return res.render('pages/loans/index', {
    title: 'Préstamos',
    user: req.user,
    currentPath: '/admin/loans',
    loans,
    search: search ?? '',
    status: status ?? '',
    flashSucess,
    flashError,
  });
});

/**
 * GET /admin/loans/new
 * Muestra el formulario para crear un préstamo nuevo.
 * Precarga la lista de clientes activos y rutas de la organización.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getNewLoan = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  const [clients, collectors, routes] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, documentNumber: true },
    }),
    prisma.user.findMany({
      where: {
        organizationId: req.user.organizationId,
        role: 'COLLECTOR',
        isActive: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.route.findMany({
      where: {
        organizationId: req.user.organizationId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return res.render('pages/loans/new', {
    title: 'Nuevo Préstamo',
    user: req.user,
    currentPath: '/admin/loans/new',
    clients,
    collectors,
    routes,
    flashSucess,
    flashError,
  });
});

/**
 * POST /admin/loans
 * Procesa la creación de un préstamo nuevo y redirige a la lista.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createLoan = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  // Validar con el esquema de Zod
  const parsed = createLoanSchema.safeParse({
    clientId: req.body.clientId,
    collectorId: req.body.collectorId,
    principalAmount: Number(req.body.principalAmount),
    interestRate: Number(req.body.interestRate),
    paymentFrequency: req.body.paymentFrequency,
    amortizationType: req.body.amortizationType,
    numberOfPayments: Number(req.body.numberOfPayments),
    disbursementDate: req.body.disbursementDate,
    notes: req.body.notes || undefined,
  });

  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => e.message).join(', ');
    req.session.flashError = `Error de validación: ${errors}`;
    return res.redirect('/admin/loans/new');
  }

  const {
    clientId,
    collectorId,
    principalAmount,
    interestRate,
    numberOfPayments,
    disbursementDate,
    paymentFrequency,
    amortizationType,
    notes,
  } = parsed.data;

  // Generar el cronograma de amortización (función pura)
  const amortization = generateFixedDailySchedule({
    principal: principalAmount,
    totalRate: interestRate,
    termDays: numberOfPayments,
    startDate: disbursementDate,
  });

  // Preparar valores monetarios con Decimal.js
  const principalDec = new Decimal(principalAmount);
  const totalAmountDec = new Decimal(amortization.totalAmount);
  const installmentAmountDec = new Decimal(amortization.installmentAmount);

  // Convertir fechas string (YYYY-MM-DD) a objetos Date
  const disbursementDateObj = new Date(disbursementDate);
  const expectedEndDateObj = new Date(amortization.expectedEndDate);

  // Crear préstamo y cronograma en una transacción
  const loan = await prisma.$transaction(async (tx) => {
    const newLoan = await tx.loan.create({
      data: {
        organizationId: req.user.organizationId,
        clientId,
        collectorId,
        status: 'ACTIVE',
        amortizationType,
        paymentFrequency,
        principalAmount: principalDec.toFixed(2),
        interestRate,
        totalAmount: totalAmountDec.toFixed(2),
        installmentAmount: installmentAmountDec.toFixed(2),
        totalPaid: '0.00',
        outstandingBalance: totalAmountDec.toFixed(2),
        moraAmount: '0.00',
        numberOfPayments,
        paidPayments: 0,
        disbursementDate: disbursementDateObj,
        expectedEndDate: expectedEndDateObj,
        notes,
      },
    });

    // Crear el cronograma de pagos
    const scheduleData = amortization.schedule.map((inst) => ({
      loanId: newLoan.id,
      installmentNumber: inst.installmentNumber,
      dueDate: new Date(inst.dueDate),
      amountDue: inst.amountDue,
      principalDue: inst.principalDue,
      interestDue: inst.interestDue,
      amountPaid: '0.00',
      moraCharged: '0.00',
      isPaid: false,
    }));

    await tx.paymentSchedule.createMany({ data: scheduleData });

    return newLoan;
  });

  req.session.flashSucess = `Préstamo creado exitosamente: ${loan.id}`;
  return res.redirect(`/admin/loans/${loan.id}`);
});

/**
 * GET /admin/loans/:id
 * Muestra el detalle completo de un préstamo: datos generales, cronograma,
 * pagos registrados e incidentes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getLoan = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { id } = req.params;

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  const loan = await prisma.loan.findFirst({
    where: { id, organizationId: req.user.organizationId },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          documentType: true,
          documentNumber: true,
          phone: true,
          address: true,
          businessName: true,
          isActive: true,
          route: { select: { id: true, name: true } },
        },
      },
      collector: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
      paymentSchedule: {
        orderBy: { installmentNumber: 'asc' },
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          amountDue: true,
          principalDue: true,
          interestDue: true,
          amountPaid: true,
          moraCharged: true,
          isPaid: true,
          paidAt: true,
        },
      },
      payments: {
        orderBy: { collectedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          amount: true,
          moraAmount: true,
          totalReceived: true,
          paymentMethod: true,
          notes: true,
          collectedAt: true,
          collector: { select: { firstName: true, lastName: true } },
        },
      },
      incidents: {
        orderBy: { reportedAt: 'desc' },
        select: {
          id: true,
          type: true,
          description: true,
          reportedAt: true,
          collector: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!loan) {
    const err = new Error('Préstamo no encontrado');
    err.status = 404;
    throw err;
  }

  return res.render('pages/loans/detail', {
    title: `Préstamo — ${loan.client.firstName} ${loan.client.lastName}`,
    user: req.user,
    loan,
    currentPath: `/admin/loans/${id}`,
    flashSucess,
    flashError,
  });
});

/**
 * GET /admin/clients
 * Lista los clientes de la organización.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getClients = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { search } = req.query;

  const where = {
    organizationId: req.user.organizationId,
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const clients = await prisma.client.findMany({
    where,
    orderBy: { firstName: 'asc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      documentType: true,
      documentNumber: true,
      phone: true,
      address: true,
      businessName: true,
      isActive: true,
      createdAt: true,
      _count: { select: { loans: true } },
    },
  });

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  return res.render('pages/clients/index', {
    title: 'Clientes',
    user: req.user,
    currentPath: '/admin/clients',
    clients,
    search: search || '',
    flashSucess,
    flashError,
  });
});

/**
 * GET /admin/clients/:id
 * Muestra el perfil completo del cliente con sus préstamos e incidentes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getClient = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  console.log('[DEBUG getClient] Inicio - Buscando cliente:', req.params.id);

  const client = await prisma.client.findFirst({
    where: {
      id: req.params.id,
      loans: { some: { organizationId: req.user.organizationId } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      documentType: true,
      documentNumber: true,
      phone: true,
      address: true,
      businessName: true,
      businessAddress: true,
      notes: true,
      isActive: true,
      createdAt: true,
    },
  });

  console.log('[DEBUG getClient] Cliente encontrado:', client ? 'SÍ' : 'NO');

  if (!client) {
    const err = new Error('Cliente no encontrado');
    err.statusCode = 404;
    err.isOperational = true;
    throw err;
  }

  console.log('[DEBUG getClient] Consultando préstamos e incidentes...');

  const [loans, incidents] = await Promise.all([
    prisma.loan.findMany({
      where: { clientId: client.id, organizationId: req.user.organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        principalAmount: true,
        totalAmount: true,
        totalPaid: true,
        outstandingBalance: true,
        numberOfPayments: true,
        paidPayments: true,
        disbursementDate: true,
        collector: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.incident.findMany({
      where: { loan: { clientId: client.id, organizationId: req.user.organizationId } },
      orderBy: { reportedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        type: true,
        description: true,
        reportedAt: true,
        collector: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  console.log('[DEBUG getClient] Préstamos:', loans.length, 'Incidentes:', incidents.length);

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  console.log('[DEBUG getClient] Preparando renderizado...');
  console.log('[DEBUG getClient] - Template: pages/client-detail');
  console.log('[DEBUG getClient] - Cliente:', `${client.firstName} ${client.lastName}`);
  console.log('[DEBUG getClient] - Views path:', req.app.get('views'));
  console.log('[DEBUG getClient] - View engine:', req.app.get('view engine'));
  console.log('[DEBUG getClient] - View cache:', req.app.get('view cache'));

  const renderData = {
    title: `${client.firstName} ${client.lastName}`,
    user: req.user,
    currentPath: '/admin/clients',
    client,
    loans,
    incidents,

    flashSucess,

    flashError,
  };

  console.log('[DEBUG getClient] - Datos a pasar:', Object.keys(renderData));

  try {
    console.log('[DEBUG getClient] Llamando a res.render()...');
    return res.render('pages/client-detail', renderData);
  } catch (error) {
    console.error('[DEBUG getClient] ERROR en res.render():', error);
    throw error;
  }
});

/**
 * GET /admin/clients/new
 * Renderiza el formulario para crear un nuevo cliente.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getNewClient = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  // Obtener rutas de la organización para el select
  const routes = await prisma.route.findMany({
    where: { organizationId: req.user.organizationId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const { flashError } = req.session;
  delete req.session.flashError;

  return res.render('pages/clients/new', {
    title: 'Nuevo Cliente',
    user: req.user,
    currentPath: '/admin/clients/new',
    routes,
    flashError,
  });
});

/**
 * POST /admin/clients
 * Crea un nuevo cliente en la organización actual.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createClient = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  const {
    firstName,
    lastName,
    documentType,
    documentNumber,
    phone,
    address,
    neighborhood,
    city,
    referenceContact,
    referencePhone,
    businessName,
    businessAddress,
    notes,
    routeId,
    isActive,
  } = req.body;

  try {
    await prisma.client.create({
      data: {
        organizationId: req.user.organizationId,
        firstName,
        lastName,
        documentType: documentType || 'CC',
        documentNumber,
        phone: phone || null,
        address,
        neighborhood: neighborhood || null,
        city: city || 'Riohacha',
        referenceContact: referenceContact || null,
        referencePhone: referencePhone || null,
        businessName: businessName || null,
        businessAddress: businessAddress || null,
        notes: notes || null,
        routeId: routeId || null,
        isActive,
      },
    });

    req.session.flashSucess = 'Cliente creado correctamente';
    return res.redirect('/admin/clients');
  } catch (error) {
    // Error de unicidad (cédula duplicada en la organización) - código Prisma P2002
    if (error.code === 'P2002') {
      req.session.flashError = 'Ya existe un cliente con esa cédula en tu organización';
      return res.redirect('/admin/clients/new');
    }
    throw error;
  }
});

/**
 * GET /admin/clients/:id/edit
 * Renderiza el formulario para editar un cliente existente.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getEditClient = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { id } = req.params;

  const [client, routes] = await Promise.all([
    prisma.client.findFirst({
      where: {
        id,
        organizationId: req.user.organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        routeId: true,
        firstName: true,
        lastName: true,
        documentType: true,
        documentNumber: true,
        phone: true,
        address: true,
        neighborhood: true,
        city: true,
        referenceContact: true,
        referencePhone: true,
        businessName: true,
        businessAddress: true,
        notes: true,
        isActive: true,
        creditScore: true,
      },
    }),
    prisma.route.findMany({
      where: { organizationId: req.user.organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!client) {
    req.session.flashError = 'Cliente no encontrado';
    return res.redirect('/admin/clients');
  }

  const { flashError } = req.session;
  delete req.session.flashError;

  return res.render('pages/clients/edit', {
    title: 'Editar Cliente',
    user: req.user,
    currentPath: '/admin/clients',
    client,
    routes,
    flashError,
    DOCUMENT_OPTIONS: [
      { value: 'CC', label: 'Cédula de Ciudadanía' },
      { value: 'CE', label: 'Cédula de Extranjería' },
      { value: 'TI', label: 'Tarjeta de Identidad' },
      { value: 'NIT', label: 'NIT' },
      { value: 'PP', label: 'Pasaporte' },
      { value: 'PEP', label: 'PEP' },
    ],
  });
});

/**
 * PUT /admin/clients/:id
 * Actualiza un cliente existente de la organización.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const updateClient = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { id } = req.params;

  const {
    firstName,
    lastName,
    documentType,
    documentNumber,
    phone,
    address,
    neighborhood,
    city,
    referenceContact,
    referencePhone,
    businessName,
    businessAddress,
    notes,
    routeId,
    isActive,
  } = req.body;

  // Verificar que el cliente pertenece a la organización
  const existingClient = await prisma.client.findFirst({
    where: {
      id,
      organizationId: req.user.organizationId,
    },
  });

  if (!existingClient) {
    req.session.flashError = 'Cliente no encontrado';
    return res.redirect('/admin/clients');
  }

  try {
    await prisma.client.update({
      where: { id },
      data: {
        firstName,
        lastName,
        documentType: documentType || 'CC',
        documentNumber,
        phone: phone || null,
        address,
        neighborhood: neighborhood || null,
        city: city || 'Riohacha',
        referenceContact: referenceContact || null,
        referencePhone: referencePhone || null,
        businessName: businessName || null,
        businessAddress: businessAddress || null,
        notes: notes || null,
        routeId: routeId || null,
        isActive,
      },
    });

    req.session.flashSucess = 'Cliente actualizado correctamente';
    return res.redirect('/admin/clients');
  } catch (error) {
    // Error de unicidad (cédula duplicada)
    if (error.code === 'P2002') {
      req.session.flashError = 'Ya existe otro cliente con esa cédula';
      return res.redirect(`/admin/clients/${id}/edit`);
    }
    throw error;
  }
});

/**
 * GET /admin/collectors
 * Lista los cobradores de la organización con sus rutas asignadas y
 * el rendimiento del día (pagos recaudados hoy).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getCollectors = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const collectors = await prisma.user.findMany({
    where: {
      organizationId: req.user.organizationId,
      role: 'COLLECTOR',
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      isActive: true,
      lastLoginAt: true,
      routes: {
        where: { isActive: true },
        select: { id: true, name: true },
      },
      payments: {
        where: {
          collectedAt: { gte: todayStart, lte: todayEnd },
        },
        select: { totalReceived: true },
      },
    },
    orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
  });

  return res.render('pages/collectors/index', {
    title: 'Cobradores',
    user: req.user,
    currentPath: '/admin/collectors',
    collectors,
  });
});

/**
 * GET /admin/collectors/new
 * Renderiza el formulario para crear un nuevo cobrador.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getNewCollector = asyncHandler(async (req, res) => {
  const { flashError } = req.session;
  delete req.session.flashError;

  return res.render('pages/collectors/new', {
    title: 'Nuevo Cobrador',
    user: req.user,
    currentPath: '/admin/collectors',
    flashError,
  });
});

/**
 * POST /admin/collectors
 * Crea un nuevo cobrador en la organización actual.
 * El rol se fuerza a COLLECTOR independientemente del body.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createCollector = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { default: bcrypt } = await import('bcrypt');

  const { firstName, lastName, email, phone, password } = req.body;

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        organizationId: req.user.organizationId,
        firstName,
        lastName,
        email,
        phone: phone || null,
        role: 'COLLECTOR',
        passwordHash,
        isActive: true,
      },
    });

    req.session.flashSucess = 'Cobrador creado correctamente';
    return res.redirect('/admin/collectors');
  } catch (error) {
    if (error.code === 'P2002') {
      req.session.flashError = 'El email ya está registrado';
      return res.redirect('/admin/collectors/new');
    }
    throw error;
  }
});

/**
 * GET /admin/collectors/:id/edit
 * Renderiza el formulario para editar un cobrador existente.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getEditCollector = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { id } = req.params;

  const collector = await prisma.user.findFirst({
    where: {
      id,
      organizationId: req.user.organizationId,
      role: 'COLLECTOR',
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      isActive: true,
    },
  });

  if (!collector) {
    req.session.flashError = 'Cobrador no encontrado';
    return res.redirect('/admin/collectors');
  }

  const { flashError } = req.session;
  delete req.session.flashError;

  return res.render('pages/collectors/edit', {
    title: 'Editar Cobrador',
    user: req.user,
    currentPath: '/admin/collectors',
    collector,
    flashError,
  });
});

/**
 * PUT /admin/collectors/:id
 * Actualiza un cobrador existente de la organización.
 * Si se envía password no vacío, se hashea y actualiza.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const updateCollector = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { default: bcrypt } = await import('bcrypt');
  const { id } = req.params;

  const { firstName, lastName, email, phone, password, isActive } = req.body;

  const existingCollector = await prisma.user.findFirst({
    where: {
      id,
      organizationId: req.user.organizationId,
      role: 'COLLECTOR',
    },
  });

  if (!existingCollector) {
    req.session.flashError = 'Cobrador no encontrado';
    return res.redirect('/admin/collectors');
  }

  try {
    const updateData = {
      firstName,
      lastName,
      email,
      phone: phone || null,
      isActive: isActive ?? true,
    };

    if (password && password.trim() !== '') {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    await prisma.user.update({
      where: { id },
      data: updateData,
    });

    req.session.flashSucess = 'Cobrador actualizado correctamente';
    return res.redirect('/admin/collectors');
  } catch (error) {
    if (error.code === 'P2002') {
      req.session.flashError = 'El email ya está registrado por otro usuario';
      return res.redirect(`/admin/collectors/${id}/edit`);
    }
    throw error;
  }
});

/**
 * GET /admin/payments
 * Lista los pagos recibidos de la organización con filtros y paginación.
 * Filtros: dateFrom, dateTo, collectorId, paymentMethod, page.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getPayments = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { organizationId } = req.user;

  const { dateFrom, dateTo, collectorId, paymentMethod, page: pageParam } = req.query;

  const PAGE_SIZE = 25;
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  // Construir filtro de fechas solo si el usuario especifica alguna
  /** @type {import('@prisma/client').Prisma.DateTimeFilter|undefined} */
  let collectedAtFilter;
  if (dateFrom || dateTo) {
    collectedAtFilter = {};
    if (dateFrom) {
      collectedAtFilter.gte = new Date(dateFrom);
    }
    if (dateTo) {
      collectedAtFilter.lte = new Date(`${dateTo}T23:59:59.999Z`);
    }
  }

  /** @type {import('@prisma/client').Prisma.PaymentWhereInput} */
  const where = {
    loan: { organizationId },
    ...(collectedAtFilter && { collectedAt: collectedAtFilter }),
    ...(collectorId && { collectorId }),
    ...(paymentMethod && { paymentMethod }),
  };

  const [payments, total, collectors] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { collectedAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        amount: true,
        moraAmount: true,
        totalReceived: true,
        paymentMethod: true,
        telegramSent: true,
        notes: true,
        collectedAt: true,
        loan: {
          select: {
            id: true,
            client: { select: { firstName: true, lastName: true } },
          },
        },
        collector: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.user.findMany({
      where: { organizationId, role: 'COLLECTOR', isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  return res.render('pages/payments/index', {
    title: 'Pagos',
    user: req.user,
    currentPath: '/admin/payments',
    payments,
    collectors,
    total,
    page,
    totalPages,
    filters: {
      dateFrom: dateFrom || '',
      dateTo: dateTo || '',
      collectorId: collectorId || '',
      paymentMethod: paymentMethod || '',
    },

    flashSucess,

    flashError,
  });
});

/**
 * GET /admin/routes
 * Lista las rutas de cobro de la organización.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getRoutes = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { organizationId } = req.user;

  const routes = await prisma.route.findMany({
    where: { organizationId },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      collector: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { clients: true } },
    },
  });

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  return res.render('pages/routes/index', {
    title: 'Rutas',
    user: req.user,
    currentPath: '/admin/routes',
    routes,
    flashSucess,
    flashError,
  });
});

/**
 * GET /admin/reports
 * Muestra la página de reportes con preview de cartera del día.
 * Acepta filtros opcionales: dateFrom, dateTo, routeId.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getReports = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { dateFrom, dateTo, routeId } = req.query;
  const { organizationId } = req.user;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filterDateFrom = dateFrom ? new Date(dateFrom) : today;
  const filterDateTo = dateTo ? new Date(dateTo) : today;
  filterDateTo.setHours(23, 59, 59, 999);

  const [portfolio, routes] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: {
        dueDate: { gte: filterDateFrom, lte: filterDateTo },
        loan: {
          organizationId,
          status: { in: ['ACTIVE', 'PENDING', 'DEFAULTED'] },
          ...(routeId && {
            collector: {
              routes: { some: { id: routeId } },
            },
          }),
        },
      },
      select: {
        id: true,
        dueDate: true,
        amountDue: true,
        amountPaid: true,
        loan: {
          select: {
            id: true,
            status: true,
            outstandingBalance: true,
            moraAmount: true,
            client: {
              select: { firstName: true, lastName: true, phone: true },
            },
            collector: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { loan: { client: { lastName: 'asc' } } },
      take: 200,
    }),
    prisma.route.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  return res.render('pages/reports/index', {
    title: 'Reportes',
    user: req.user,
    currentPath: '/admin/reports',
    portfolio,
    routes,
    filters: {
      dateFrom: dateFrom || '',
      dateTo: dateTo || '',
      routeId: routeId || '',
    },

    flashSucess,

    flashError,
  });
});

/**
 * GET /admin/settings
 * Muestra la página de configuración de la organización.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getSettings = asyncHandler(async (req, res) =>
  res.render('pages/settings', {
    title: 'Configuración',
    user: req.user,
    currentPath: '/admin/settings',
  }),
);

/**
 * GET /admin/users
 * Lista los usuarios del sistema (solo SUPER_ADMIN).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getUsers = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { search } = req.query;

  const where = {
    organizationId: req.user.organizationId,
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: { firstName: 'asc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  return res.render('pages/users/index', {
    title: 'Usuarios',
    user: req.user,
    currentPath: '/admin/users',
    users,
    search: search || '',

    flashSucess,

    flashError,
  });
});

/**
 * GET /admin/users/new
 * Renderiza el formulario para crear un nuevo usuario.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getNewUser = asyncHandler(async (req, res) => {
  const { flashError } = req.session;
  delete req.session.flashError;

  return res.render('pages/users/new', {
    title: 'Nuevo Usuario',
    user: req.user,
    currentPath: '/admin/users/new',
    flashError,
  });
});

/**
 * POST /admin/users
 * Crea un nuevo usuario en la organización actual.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createUser = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { default: bcrypt } = await import('bcrypt');

  const { firstName, lastName, email, phone, role, password, isActive } = req.body;

  try {
    // Hashear la contraseña con factor de costo 12
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        organizationId: req.user.organizationId,
        firstName,
        lastName,
        email,
        phone: phone || null,
        role,
        passwordHash,
        isActive: isActive ?? true,
      },
    });

    req.session.flashSucess = 'Usuario creado correctamente';
    return res.redirect('/admin/users');
  } catch (error) {
    // Error de unicidad (email duplicado) - código Prisma P2002
    if (error.code === 'P2002') {
      req.session.flashError = 'El email ya está registrado';
      return res.redirect('/admin/users/new');
    }
    throw error;
  }
});

/**
 * GET /admin/users/:id/edit
 * Renderiza el formulario para editar un usuario existente.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getEditUser = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { id } = req.params;

  const targetUser = await prisma.user.findFirst({
    where: {
      id,
      organizationId: req.user.organizationId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
    },
  });

  if (!targetUser) {
    req.session.flashError = 'Usuario no encontrado';
    return res.redirect('/admin/users');
  }

  const { flashError } = req.session;
  delete req.session.flashError;

  return res.render('pages/users/edit', {
    title: 'Editar Usuario',
    user: req.user,
    currentPath: '/admin/users',
    targetUser,
    flashError,
  });
});

/**
 * PUT /admin/users/:id
 * Actualiza un usuario existente de la organización.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const updateUser = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { default: bcrypt } = await import('bcrypt');
  const { id } = req.params;

  const { firstName, lastName, email, phone, role, password, isActive } = req.body;

  // Verificar que el usuario pertenece a la organización
  const existingUser = await prisma.user.findFirst({
    where: {
      id,
      organizationId: req.user.organizationId,
    },
  });

  if (!existingUser) {
    req.session.flashError = 'Usuario no encontrado';
    return res.redirect('/admin/users');
  }

  try {
    // Preparar datos de actualización
    const updateData = {
      firstName,
      lastName,
      email,
      phone: phone || null,
      role,
      isActive: isActive ?? true,
    };

    // Si se envió una nueva contraseña, hashearla
    if (password && password.trim() !== '') {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    await prisma.user.update({
      where: { id },
      data: updateData,
    });

    req.session.flashSucess = 'Usuario actualizado correctamente';
    return res.redirect('/admin/users');
  } catch (error) {
    // Error de unicidad (email duplicado)
    if (error.code === 'P2002') {
      req.session.flashError = 'El email ya está registrado por otro usuario';
      return res.redirect(`/admin/users/${id}/edit`);
    }
    throw error;
  }
});

/**
 * GET /admin/organizations
 * Lista las organizaciones del sistema (solo SUPER_ADMIN).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getOrganizations = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { search } = req.query;

  /** @type {import('@prisma/client').Prisma.OrganizationWhereInput} */
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { nit: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const organizations = await prisma.organization.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      nit: true,
      logoUrl: true,
      planType: true,
      subscriptionEnds: true,
      moraGraceDays: true,
      moraMultiplier: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: { users: true, loans: true },
      },
    },
  });

  const { flashSucess, flashError } = req.session;
  delete req.session.flashSucess;
  delete req.session.flashError;

  return res.render('pages/organizations/index', {
    title: 'Organizaciones',
    user: req.user,
    currentPath: '/admin/organizations',
    organizations,
    search: search || '',
    flashSucess,
    flashError,
  });
});

/**
 * GET /admin/organizations/new
 * Renderiza el formulario para crear una nueva organización (solo SUPER_ADMIN).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getNewOrganization = asyncHandler(async (req, res) => {
  const { flashError } = req.session;
  delete req.session.flashError;

  return res.render('pages/organizations/new', {
    title: 'Nueva Organización',
    user: req.user,
    currentPath: '/admin/organizations/new',
    flashError,
  });
});

/**
 * POST /admin/organizations
 * Crea una nueva organización en el sistema (solo SUPER_ADMIN).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createOrganization = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  const {
    name,
    nit,
    phone,
    email,
    address,
    logoUrl,
    planType,
    subscriptionEnds,
    moraGraceDays,
    moraMultiplier,
    isActive,
  } = req.body;

  try {
    await prisma.organization.create({
      data: {
        name,
        nit: nit || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        logoUrl: logoUrl || null,
        planType: planType || 'BASIC',
        subscriptionEnds: subscriptionEnds ? new Date(subscriptionEnds) : null,
        moraGraceDays: moraGraceDays ?? 0,
        moraMultiplier: moraMultiplier ?? 1.5,
        isActive: isActive ?? true,
      },
    });

    req.session.flashSucess = 'Organización creada correctamente';
    return res.redirect('/admin/organizations');
  } catch (error) {
    // Error de unicidad (NIT duplicado) - código Prisma P2002
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'campo';
      req.session.flashError = `El ${field} ya está registrado en otra organización`;
      return res.redirect('/admin/organizations/new');
    }

    // Re-lanzar otros errores para el errorHandler global
    throw error;
  }
});

/**
 * DELETE /admin/logout
 * Cierra la sesión y redirige al login.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const logout = asyncHandler(async (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/admin/login');
  });
});

/**
 * PUT /admin/clients/:id/restrict
 * Alterna el estado de restricción de un cliente (activo ↔ restringido).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const restrictClient = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  const client = await prisma.client.findFirst({
    where: {
      id: req.params.id,
      loans: { some: { organizationId: req.user.organizationId } },
    },
    select: { id: true, isActive: true, firstName: true, lastName: true },
  });

  if (!client) {
    const err = new Error('Cliente no encontrado');
    err.statusCode = 404;
    err.isOperational = true;
    throw err;
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { isActive: !client.isActive },
  });

  req.session.flashSucess = client.isActive
    ? `Cliente ${client.firstName} ${client.lastName} restringido correctamente`
    : `Cliente ${client.firstName} ${client.lastName} reactivado correctamente`;

  return res.redirect(`/admin/clients/${client.id}`);
});

/**
 * POST /admin/loans/preview
 * Genera una previsualización del cronograma de amortización sin persistir en BD.
 * Devuelve JSON con el resultado del motor financiero.
 *
 * Body esperado (application/json):
 *   principalAmount  {string|number}
 *   interestRate     {string|number}
 *   paymentFrequency {string}        – solo DAILY soportado en esta versión
 *   amortizationType {string}
 *   numberOfPayments {number}
 *   disbursementDate {string}        – YYYY-MM-DD
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const previewLoan = asyncHandler(async (req, res) => {
  // Reutilizamos el schema existente (omitiendo clientId y collectorId)
  const previewSchema = createLoanSchema.omit({ clientId: true, collectorId: true, notes: true });

  const parsed = previewSchema.safeParse({
    principalAmount: Number(req.body.principalAmount),
    interestRate: Number(req.body.interestRate),
    paymentFrequency: req.body.paymentFrequency,
    amortizationType: req.body.amortizationType,
    numberOfPayments: Number(req.body.numberOfPayments),
    disbursementDate: req.body.disbursementDate,
  });

  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return apiResponse.error(res, 'Datos de previsualización inválidos', 422, errors);
  }

  const { principalAmount, interestRate, numberOfPayments, disbursementDate } = parsed.data;

  // Motor financiero (función pura, sin DB)
  const result = generateFixedDailySchedule({
    principal: principalAmount,
    totalRate: interestRate,
    termDays: numberOfPayments,
    startDate: disbursementDate,
  });

  return apiResponse.success(res, result, 'Previsualización generada correctamente');
});

// ============================================
// PAGOS - Formulario y Registro desde Admin
// ============================================

/**
 * GET /admin/payments/new
 * Renderiza el formulario para registrar un nuevo pago.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getNewPayment = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');
  const { organizationId } = req.user;

  // Obtener préstamos activos y cobradores en paralelo
  const [loans, collectors] = await Promise.all([
    prisma.loan.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        principalAmount: true,
        outstandingBalance: true,
        installmentAmount: true,
        client: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { organizationId, role: 'COLLECTOR', isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    }),
  ]);

  const { flashError } = req.session;
  delete req.session.flashError;

  return res.render('pages/payments/new', {
    title: 'Registrar Pago',
    user: req.user,
    currentPath: '/admin/payments/new',
    loans,
    collectors,
    flashError,
  });
});

/**
 * POST /admin/payments
 * Procesa el registro de un nuevo pago desde el panel administrativo.
 * Usa transacción de Prisma para garantizar consistencia.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createPayment = asyncHandler(async (req, res) => {
  const { default: prisma } = await import('../config/prisma.js');

  const { loanId, amountPaid, paymentDate, collectorId, paymentMethod, notes } = req.body;

  // Validaciones básicas
  if (!loanId || !amountPaid || !paymentDate || !collectorId) {
    req.session.flashError = 'Todos los campos requeridos deben estar completos';
    return res.redirect('/admin/payments/new');
  }

  const amountDecimal = new Decimal(amountPaid);

  if (amountDecimal.lte(0)) {
    req.session.flashError = 'El monto debe ser mayor a cero';
    return res.redirect('/admin/payments/new');
  }

  // Ejecutar transacción
  const result = await prisma.$transaction(async (tx) => {
    // 1. Buscar el préstamo y verificar que esté activo
    const loan = await tx.loan.findUnique({
      where: { id: loanId },
      include: {
        client: { select: { firstName: true, lastName: true, phone: true } },
        collector: { select: { firstName: true, lastName: true } },
        paymentSchedule: {
          where: { isPaid: false },
          orderBy: { installmentNumber: 'asc' },
        },
      },
    });

    if (!loan) {
      throw new Error('Préstamo no encontrado');
    }

    if (loan.status !== 'ACTIVE') {
      throw new Error('El préstamo no está activo');
    }

    // 2. Calcular montos usando Decimal.js
    const currentOutstanding = new Decimal(loan.outstandingBalance);
    const currentTotalPaid = new Decimal(loan.totalPaid);
    const currentMora = new Decimal(loan.moraAmount);

    // Si hay mora pendiente, primero se aplica a la mora
    let moraPayment = new Decimal(0);
    let capitalPayment = amountDecimal;

    if (currentMora.gt(0)) {
      if (amountDecimal.gte(currentMora)) {
        moraPayment = currentMora;
        capitalPayment = amountDecimal.minus(currentMora);
      } else {
        moraPayment = amountDecimal;
        capitalPayment = new Decimal(0);
      }
    }

    // Nuevo saldo pendiente
    const newOutstanding = Decimal.max(currentOutstanding.minus(capitalPayment), 0);
    const newTotalPaid = currentTotalPaid.plus(capitalPayment);
    const newMora = currentMora.minus(moraPayment);

    // Determinar nuevo estado
    const isFullyPaid = newOutstanding.eq(0);
    const newStatus = isFullyPaid ? 'COMPLETED' : 'ACTIVE';

    // 3. Actualizar el préstamo
    const updatedLoan = await tx.loan.update({
      where: { id: loanId },
      data: {
        totalPaid: newTotalPaid.toFixed(2),
        outstandingBalance: newOutstanding.toFixed(2),
        moraAmount: newMora.toFixed(2),
        paidPayments: { increment: 1 },
        status: newStatus,
        ...(isFullyPaid && { actualEndDate: new Date(paymentDate) }),
      },
    });

    // 4. Marcar cuotas como pagadas usando reduce secuencial
    if (capitalPayment.gt(0) && loan.paymentSchedule.length > 0) {
      let remaining = capitalPayment;

      // Calcular actualizaciones necesarias
      const scheduleUpdates = loan.paymentSchedule.reduce((updates, schedule) => {
        if (remaining.lte(0)) return updates;

        const amountDue = new Decimal(schedule.amountDue);
        const alreadyPaid = new Decimal(schedule.amountPaid);
        const pendingOnSchedule = amountDue.minus(alreadyPaid);

        if (pendingOnSchedule.lte(0)) return updates;

        const payThisSchedule = Decimal.min(remaining, pendingOnSchedule);
        const newAmountPaid = alreadyPaid.plus(payThisSchedule);
        const isPaid = newAmountPaid.gte(amountDue);

        remaining = remaining.minus(payThisSchedule);

        updates.push({
          id: schedule.id,
          amountPaid: newAmountPaid.toFixed(2),
          isPaid,
          paidAt: isPaid ? new Date(paymentDate) : null,
        });

        return updates;
      }, []);

      // Ejecutar actualizaciones en paralelo
      await Promise.all(
        scheduleUpdates.map((update) =>
          tx.paymentSchedule.update({
            where: { id: update.id },
            data: {
              amountPaid: update.amountPaid,
              isPaid: update.isPaid,
              ...(update.paidAt && { paidAt: update.paidAt }),
            },
          }),
        ),
      );
    }

    // 5. Crear el registro de pago
    const payment = await tx.payment.create({
      data: {
        loanId,
        collectorId,
        amount: capitalPayment.toFixed(2),
        moraAmount: moraPayment.toFixed(2),
        totalReceived: amountDecimal.toFixed(2),
        paymentMethod: paymentMethod || 'CASH',
        notes: notes || null,
        collectedAt: new Date(paymentDate),
        telegramSent: false,
      },
    });

    return { payment, loan: updatedLoan, client: loan.client };
  });

  // 6. Encolar notificación de Telegram (sólo si Redis está disponible)
  if (telegramQueue) {
    await telegramQueue.add('send-receipt', {
      type: 'payment-receipt',
      data: {
        paymentId: result.payment.id,
        chatId: process.env.TELEGRAM_CHAT_ID,
        clientName: `${result.client.firstName} ${result.client.lastName}`,
        amount: result.payment.amount,
        moraAmount: result.payment.moraAmount,
        totalReceived: result.payment.totalReceived,
        outstandingBalance: result.loan.outstandingBalance,
        paidPayments: result.loan.paidPayments,
        totalInstallments: result.loan.numberOfPayments,
        collectorName: `${req.user.firstName} ${req.user.lastName}`,
        collectedAt: result.payment.collectedAt.toISOString(),
      },
    });
  }

  // 7. Flash de éxito y redirección
  req.session.flashSucess = 'Pago registrado exitosamente';
  return res.redirect('/admin/payments');
});

export {
  getLogin,
  postLogin,
  getDashboard,
  getLoans,
  getNewLoan,
  previewLoan,
  createLoan,
  getLoan,
  getClients,
  getClient,
  getNewClient,
  createClient,
  getEditClient,
  updateClient,
  restrictClient,
  getCollectors,
  getNewCollector,
  createCollector,
  getEditCollector,
  updateCollector,
  getPayments,
  getNewPayment,
  createPayment,
  getRoutes,
  getReports,
  getSettings,
  getUsers,
  getNewUser,
  createUser,
  getEditUser,
  updateUser,
  getOrganizations,
  getNewOrganization,
  createOrganization,
  logout,
};
