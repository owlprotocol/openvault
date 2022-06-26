import React, { useState, useMemo, useEffect} from 'react';
import styled from 'styled-components';
import { SimpleGrid, Box, Image, AspectRatio, Button } from '@chakra-ui/react'; //Badge
import { useContract, useProvider } from 'wagmi';
import escrowContractJSON from '../../contractABIs/TransferableEscrowV2.json';
import moment from 'moment';
import {BigNumber, ethers} from 'ethers';
import numeral from 'numeral';

const LoanAttrBox = styled(Box)`
    > h5 {
        font-size: 12px;
        color: #777;
    }

    font-weight: bold;
    font-size: 18px;
`;

const dateFormat = 'MMM D, YYYY';

const LoanCard = ({ loanItem, setActiveLoanItem }: any) => {

    const provider = useProvider();

    const escrowContract = useContract({
        addressOrName: loanItem.address,
        contractInterface: escrowContractJSON.abi,
        signerOrProvider: provider,
    });

    const [paymentInfo, setPaymentInfo] = useState<any>();

    // const [finalData, setFinalData] = useState();

    // TODO: parallel async promise fetch
    useEffect(() => {
        escrowContract.paymentInfo().then(setPaymentInfo).catch((err: any) => {
            console.error(`${loanItem.address} contract not found`, err);
        });
    }, [escrowContract]);

    const finalLoanItem = useMemo(() => {
        return {
            address: loanItem.address,
            loanStartDate: paymentInfo ? moment(paymentInfo.loanStart.toNumber()).format(dateFormat) : null,
            loanEndDate: paymentInfo ? moment(paymentInfo.loanEnd.toNumber()).format(dateFormat) : null,
            weiPaid: paymentInfo ? ethers.utils.formatEther(paymentInfo.weiPaid) : null,
        };
    }, [paymentInfo]);

    console.log(finalLoanItem);

    return (
        <Box key={loanItem.name} mx={4} w="326px" boxShadow="lg" borderWidth="1px" borderRadius="lg" overflow="hidden">
            <AspectRatio maxH="200px" ratio={4 / 3}>
                <Image src={loanItem.imageUrl} alt={loanItem.imageAlt} />
            </AspectRatio>

            <Box p="6">
                <Box color="#404040" fontWeight="bold" letterSpacing="wide" fontSize="18" mb={4}>
                    {loanItem.name}
                </Box>

                <SimpleGrid columns={2} spacing={4}>
                    <LoanAttrBox>
                        <h5>Equity Owned:</h5>
                        <span>{numeral(loanItem.equityOwned).format('$0,0')}</span>
                    </LoanAttrBox>
                    <LoanAttrBox>
                        <h5>Asset Value:</h5>
                        <span>{numeral(loanItem.assetValue).format('$0,0')}</span>
                    </LoanAttrBox>
                    <LoanAttrBox>
                        <h5>Interest rate:</h5>
                        <span>{numeral(loanItem.interestRate).format('0%')}</span>
                    </LoanAttrBox>
                    <LoanAttrBox>
                        <h5>Payment Rate:</h5>
                        <span>{numeral(loanItem.paymentRate).format('$0,0.00')}/sec</span>
                    </LoanAttrBox>
                    <LoanAttrBox>
                        <h5>Prepaid Funds:</h5>
                        <span>{numeral(loanItem.prepaidFunds).format('$0,0')}</span>
                    </LoanAttrBox>
                    <LoanAttrBox>
                        <h5>Time to Default:</h5>
                        <span style={{ fontSize: 14 }}>{calcTimeToDefault(loanItem)}</span>
                    </LoanAttrBox>
                    <LoanAttrBox>
                        <h5>Start Date:</h5>
                        <span style={{ fontSize: 14 }}>{finalLoanItem.loanStartDate}</span>
                    </LoanAttrBox>
                    <LoanAttrBox>
                        <h5>Maturity Date:</h5>
                        <span style={{ fontSize: 14 }}>{finalLoanItem.loanEndDate}</span>
                    </LoanAttrBox>
                    <Button onClick={() => setActiveLoanItem(loanItem)}>Add Funds</Button>
                    <Button variant="secondary">List for Sale</Button>
                </SimpleGrid>
            </Box>
        </Box>
    );
};

function calcTimeToDefault(tempLoanItem: any) {
    const secondsLeft = tempLoanItem.prepaidFunds / tempLoanItem.paymentRate;

    /*
    let timeLeftFormat: string;

    if (secondsLeft > 60 * 60 * 24) {
        timeLeftFormat = 'd [days] h [hours]';
    } else if (secondsLeft > 60 * 60) {
        timeLeftFormat = 'h [hours] m [minutes]';
    } else {
        timeLeftFormat = 'm [minutes] s [seconds]';
    }
    */

    return moment(Date.now() + secondsLeft * 1000).fromNow();
}

export default LoanCard;
