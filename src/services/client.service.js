import prisma from '../config/prisma.js';

/** Opciones de tipo de documento disponibles en el sistema */
export const DOCUMENT_OPTIONS = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'CE', label: 'Cédula de Extranjería' },
  { value: 'TI', label: 'Tarjeta de Identidad' },
  { value: 'NIT', label: 'NIT' },
  { value: 'PP', label: 'Pasaporte' },
  { value: 'PEP', label: 'PEP' },
];

/**
 * Lista los clientes de una organización con búsqueda opcional.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {{ search?: string }} [filters]
 * @returns {Promise<Array>}
 */
export const findClients = async (organizationId, { search } = {}) => {
  const where = {
    organizationId,
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  return prisma.client.findMany({
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
};

/**
 * Obtiene el perfil completo de un cliente con sus préstamos e incidentes.
 * Verifica que el cliente pertenezca a la organización a través de sus préstamos.
 * Lanza error 404 si no se encuentra.
 *
 * @param {string} id - UUID del cliente
 * @param {string} organizationId - UUID de la organización (scope multi-tenant)
 * @returns {Promise<{ client: object, loans: Array, incidents: Array }>}
 */
export const findClientById = async (id, organizationId) => {
  const client = await prisma.client.findFirst({
    where: {
      id,
      loans: { some: { organizationId } },
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

  if (!client) {
    const err = new Error('Cliente no encontrado');
    err.statusCode = 404;
    err.isOperational = true;
    throw err;
  }

  const [loans, incidents] = await Promise.all([
    prisma.loan.findMany({
      where: { clientId: client.id, organizationId },
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
      where: { loan: { clientId: client.id, organizationId } },
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

  return { client, loans, incidents };
};

/**
 * Obtiene los datos para el formulario de cliente (rutas activas de la organización).
 *
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<Array>}
 */
export const getClientFormRoutes = async (organizationId) => {
  return prisma.route.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
};

/**
 * Obtiene un cliente para edición, verificando que pertenezca a la organización.
 * Lanza error si no se encuentra.
 *
 * @param {string} id - UUID del cliente
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<object>}
 */
export const findClientForEdit = async (id, organizationId) => {
  const client = await prisma.client.findFirst({
    where: { id, organizationId },
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
  });

  if (!client) {
    const err = new Error('Cliente no encontrado');
    err.statusCode = 404;
    throw err;
  }

  return client;
};

/**
 * Crea un nuevo cliente en la organización.
 *
 * @param {string} organizationId - UUID de la organización
 * @param {object} data - Datos del cliente provenientes del formulario
 * @returns {Promise<import('@prisma/client').Client>}
 */
export const createClient = async (organizationId, data) => {
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
  } = data;

  try {
    return await prisma.client.create({
      data: {
        organizationId,
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
  } catch (error) {
    // documentNumber tiene constraint única por organización (ver schema.prisma @unique)
    if (error.code === 'P2002') {
      const err = new Error('Ya existe un cliente con esa cédula en esta organización');
      err.statusCode = 409;
      err.isOperational = true;
      throw err;
    }
    throw error;
  }
};

/**
 * Actualiza un cliente existente verificando que pertenezca a la organización.
 *
 * @param {string} id - UUID del cliente
 * @param {string} organizationId - UUID de la organización (scope de seguridad)
 * @param {object} data - Campos a actualizar
 * @returns {Promise<import('@prisma/client').Client>}
 */
export const updateClient = async (id, organizationId, data) => {
  await prisma.client.findFirstOrThrow({ where: { id, organizationId } });

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
  } = data;

  try {
    return await prisma.client.update({
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
  } catch (error) {
    // documentNumber tiene constraint única por organización (ver schema.prisma @unique)
    if (error.code === 'P2002') {
      const err = new Error('Ya existe otro cliente con esa cédula en esta organización');
      err.statusCode = 409;
      err.isOperational = true;
      throw err;
    }
    throw error;
  }
};

/**
 * Alterna el estado activo/restringido de un cliente.
 * Verifica el tenant a través de los préstamos asociados.
 *
 * @param {string} id - UUID del cliente
 * @param {string} organizationId - UUID de la organización
 * @returns {Promise<{ id: string, wasActive: boolean, firstName: string, lastName: string }>}
 */
export const toggleClientStatus = async (id, organizationId) => {
  const client = await prisma.client.findFirst({
    where: {
      id,
      loans: { some: { organizationId } },
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

  return { id: client.id, wasActive: client.isActive, firstName: client.firstName, lastName: client.lastName };
};
