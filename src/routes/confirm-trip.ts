import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { dayjs } from "../lib/dayjs";
import { getMailClient } from "../lib/mail";
import { ClientError } from "../error/client-error";
import { env } from "../env";

export async function confirmTrip(app: FastifyInstance) {
    app.withTypeProvider<ZodTypeProvider>().get('/trips/:tripId/confirm', {
        schema: {
            params: z.object({
                tripId: z.string().uuid()
            })
        },
    }, async (request, reply) => {
        const { tripId } = request.params

        const trip = await prisma.trip.findUnique({
            where: {
                id: tripId
            },
            include: {
                participants: {
                    where: {
                        is_owner: false
                    }
                }
            }
        })

        if (!trip) {
            throw new ClientError('trip not found.')
        }

        if (trip.is_confirmed) {
            return reply.redirect(`${env.WEB_BASE_URL}/trips/${tripId}`)
        }

        await prisma.trip.update({
            where: { id: tripId },
            data: { is_confirmed: true }
        })

        const formattedStartDate = dayjs(trip.starts_at).format('LL')
        const formattedEndDate = dayjs(trip.ends_at).format('LL')


        const mail = await getMailClient()

        await Promise.all(
            trip.participants.map(async (participant) => {
                const confirmationLink = `${env.API_BASE_URL}/participants/${participant.id}/confirm`

                const message = await mail.sendMail({
                    from: {
                        name: 'Equipe plann.er',
                        address: 'oi@plann.er'
                    },
                    to: participant.email,
                    subject: `Confirme sua presenca na viajem para ${trip.destination}`,
                    html: `
                        <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;">
                        <p>Voce solicitou a criacao de uma viagem para <strong>${trip.destination}</strong> nas datas de <strong>${formattedStartDate}</strong> ate <strong>${formattedEndDate}</strong>. </p>
                        <p></p>
                        <p>Para confirmar sua viajem, clique no link abaixo:</p>
                        <p></p>
                        <p>
                            <a href="${confirmationLink}">Confirmar viajem</a>
                        </p>
                        <p>Caso voce nao saiva do que se trata esse e-mail, apenas ignore esse e-mail.</p>
                        </div>
                    `.trim()
                })

                console.log(nodemailer.getTestMessageUrl(message))
            })
        )

        return reply.redirect(`${env.WEB_BASE_URL}/trips/${tripId}`)
    })
}